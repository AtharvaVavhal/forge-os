import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ActorType, PayoutMethod, type PayoutProfile, Prisma } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { AUDIT_ACTIONS, AuditService } from "../../shared/audit.service";
import {
  StorageService,
  type PresignedDownloadResult,
  type PresignedUploadResult,
} from "../../shared/documents/services/storage.service";
import {
  UPI_QR_ALLOWED_MIME_TYPES,
  type PresignUpiQrDto,
  type RegisterUpiQrDto,
  type UpsertPayoutProfileDto,
} from "../dto/payout-profile.dto";
import {
  emptyPayoutProfileView,
  toPayoutProfileAuditSnapshot,
  toPayoutProfileView,
  type PayoutProfileView,
} from "./payout-profile-views";

const UPI_QR_MIME = new Set<string>(UPI_QR_ALLOWED_MIME_TYPES);

/**
 * Self-service payout profile for the authenticated user.
 * FINAL: Bank Transfer fields AND UPI ID are both required on upsert.
 * UPI QR is registered via dedicated R2 presign/register endpoints.
 */
@Injectable()
export class PayoutProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService
  ) {}

  async getOwn(actor: AuthenticatedUser): Promise<PayoutProfileView> {
    const profile = await this.findOwn(actor);
    if (!profile) return emptyPayoutProfileView();
    return toPayoutProfileView(profile);
  }

  /**
   * Idempotent create-or-update. Requires bank + UPI fields together.
   * Does not clear QR metadata — QR is managed via dedicated endpoints.
   */
  async upsertOwn(
    actor: AuthenticatedUser,
    dto: UpsertPayoutProfileDto
  ): Promise<PayoutProfileView> {
    this.assertCompleteFields(dto);
    const data = this.toWriteData(dto);

    const existing = await this.findOwn(actor);

    if (!existing) {
      try {
        const created = await this.prisma.payoutProfile.create({
          data: {
            organization_id: actor.organizationId,
            user_id: actor.id,
            ...data,
          },
        });

        await this.audit.record({
          organizationId: actor.organizationId,
          actorType: ActorType.USER,
          actorId: actor.id,
          action: AUDIT_ACTIONS.PAYOUT_PROFILE_CREATED,
          entityType: "PayoutProfile",
          entityId: created.id,
          after: toPayoutProfileAuditSnapshot(created),
        });

        return toPayoutProfileView(created);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const raced = await this.findOwn(actor);
          if (raced) {
            return this.updateExisting(actor, raced, data);
          }
        }
        throw error;
      }
    }

    return this.updateExisting(actor, existing, data);
  }

  async presignUpiQr(
    actor: AuthenticatedUser,
    dto: PresignUpiQrDto
  ): Promise<PresignedUploadResult> {
    await this.requireOwnProfile(actor);
    this.assertUpiQrMime(dto.mimeType);
    this.storage.assertValidFile(dto.mimeType, dto.sizeBytes);
    return this.storage.generateUploadUrl(
      actor.organizationId,
      dto.filename,
      dto.mimeType,
      dto.sizeBytes
    );
  }

  async registerUpiQr(
    actor: AuthenticatedUser,
    dto: RegisterUpiQrDto
  ): Promise<PayoutProfileView> {
    const profile = await this.requireOwnProfile(actor);
    this.assertUpiQrMime(dto.mimeType);
    this.storage.assertValidFile(dto.mimeType, dto.sizeBytes);
    this.storage.assertValidStorageKeyForOrg(dto.storageKey, actor.organizationId);

    // Reject rebinding keys already used by KYC or CRM documents.
    const [kycKey, crmKey] = await Promise.all([
      this.prisma.kycDocument.findFirst({
        where: { storage_key: dto.storageKey },
        select: { id: true },
      }),
      this.prisma.document.findFirst({
        where: { storage_key: dto.storageKey },
        select: { id: true },
      }),
    ]);
    if (kycKey || crmKey) {
      throw new ConflictException({
        code: "STORAGE_KEY_ALREADY_REGISTERED",
        message: "This storageKey is already registered.",
      });
    }

    // Reject if another payout profile already holds this key.
    const otherQr = await this.prisma.payoutProfile.findFirst({
      where: {
        upi_qr_storage_key: dto.storageKey,
        NOT: { id: profile.id },
      },
      select: { id: true },
    });
    if (otherQr) {
      throw new ConflictException({
        code: "STORAGE_KEY_ALREADY_REGISTERED",
        message: "This storageKey is already registered.",
      });
    }

    await this.storage.assertObjectMatchesRegistration(
      dto.storageKey,
      dto.mimeType,
      dto.sizeBytes
    );

    const updated = await this.prisma.payoutProfile.update({
      where: { id: profile.id },
      data: {
        upi_qr_storage_key: dto.storageKey,
        upi_qr_filename: this.storage.sanitizeFilename(dto.filename),
        upi_qr_mime_type: dto.mimeType.toLowerCase().trim(),
        upi_qr_size_bytes: dto.sizeBytes,
      },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: ActorType.USER,
      actorId: actor.id,
      action: AUDIT_ACTIONS.PAYOUT_PROFILE_UPDATED,
      entityType: "PayoutProfile",
      entityId: updated.id,
      before: toPayoutProfileAuditSnapshot(profile),
      after: toPayoutProfileAuditSnapshot(updated),
    });

    return toPayoutProfileView(updated);
  }

  async removeUpiQr(actor: AuthenticatedUser): Promise<PayoutProfileView> {
    const profile = await this.requireOwnProfile(actor);
    if (!profile.upi_qr_storage_key) {
      return toPayoutProfileView(profile);
    }

    const updated = await this.prisma.payoutProfile.update({
      where: { id: profile.id },
      data: {
        upi_qr_storage_key: null,
        upi_qr_filename: null,
        upi_qr_mime_type: null,
        upi_qr_size_bytes: null,
      },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: ActorType.USER,
      actorId: actor.id,
      action: AUDIT_ACTIONS.PAYOUT_PROFILE_UPDATED,
      entityType: "PayoutProfile",
      entityId: updated.id,
      before: toPayoutProfileAuditSnapshot(profile),
      after: toPayoutProfileAuditSnapshot(updated),
    });

    return toPayoutProfileView(updated);
  }

  async getUpiQrDownloadUrl(
    actor: AuthenticatedUser
  ): Promise<PresignedDownloadResult> {
    const profile = await this.requireOwnProfile(actor);
    if (
      !profile.upi_qr_storage_key ||
      !profile.upi_qr_filename ||
      !profile.upi_qr_mime_type
    ) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "UPI QR code not found.",
      });
    }

    return this.storage.generateDownloadUrl(
      profile.upi_qr_storage_key,
      profile.upi_qr_filename,
      profile.upi_qr_mime_type
    );
  }

  private async updateExisting(
    actor: AuthenticatedUser,
    existing: PayoutProfile,
    data: ReturnType<PayoutProfileService["toWriteData"]>
  ): Promise<PayoutProfileView> {
    const updated = await this.prisma.payoutProfile.update({
      where: { id: existing.id },
      data,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: ActorType.USER,
      actorId: actor.id,
      action: AUDIT_ACTIONS.PAYOUT_PROFILE_UPDATED,
      entityType: "PayoutProfile",
      entityId: updated.id,
      before: toPayoutProfileAuditSnapshot(existing),
      after: toPayoutProfileAuditSnapshot(updated),
    });

    return toPayoutProfileView(updated);
  }

  private async findOwn(
    actor: AuthenticatedUser
  ): Promise<PayoutProfile | null> {
    return this.prisma.payoutProfile.findFirst({
      where: {
        organization_id: actor.organizationId,
        user_id: actor.id,
      },
    });
  }

  private async requireOwnProfile(
    actor: AuthenticatedUser
  ): Promise<PayoutProfile> {
    const profile = await this.findOwn(actor);
    if (!profile) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message:
          "Create your payout profile (bank + UPI details) before uploading a UPI QR.",
      });
    }
    return profile;
  }

  private assertCompleteFields(dto: UpsertPayoutProfileDto): void {
    const missing: string[] = [];
    if (!dto.accountHolderName?.trim()) missing.push("accountHolderName");
    if (!dto.bankName?.trim()) missing.push("bankName");
    if (!dto.accountNumber?.trim()) missing.push("accountNumber");
    if (!dto.ifsc?.trim()) missing.push("ifsc");
    if (!dto.upiId?.trim()) missing.push("upiId");
    if (missing.length > 0) {
      throw new BadRequestException({
        code: "PAYOUT_PROFILE_INCOMPLETE",
        message:
          "Payout profile requires bank transfer details and a UPI ID.",
        details: { missing },
      });
    }
  }

  private toWriteData(dto: UpsertPayoutProfileDto): {
    preferred_method: PayoutMethod;
    account_holder_name: string;
    bank_name: string;
    account_number: string;
    ifsc: string;
    upi_id: string;
  } {
    return {
      // Both methods are required; BANK_TRANSFER marks the profile as the
      // dual-complete configuration used by the onboarding gate.
      preferred_method: PayoutMethod.BANK_TRANSFER,
      account_holder_name: dto.accountHolderName.trim(),
      bank_name: dto.bankName.trim(),
      account_number: dto.accountNumber.trim(),
      ifsc: dto.ifsc.trim().toUpperCase(),
      upi_id: dto.upiId.trim(),
    };
  }

  private assertUpiQrMime(mimeType: string): void {
    if (!UPI_QR_MIME.has(mimeType.toLowerCase().trim())) {
      throw new BadRequestException({
        code: "UNSUPPORTED_MIME_TYPE",
        message: "UPI QR must be JPEG, PNG, or WebP.",
      });
    }
  }
}

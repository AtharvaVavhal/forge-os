import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  KycDocumentStatus,
  KycDocumentType,
  KycGovernmentIdType,
  KycStatus,
  Prisma,
  type KycDocument,
  type KycProfile,
} from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { AUDIT_ACTIONS, AuditService } from "../../shared/audit.service";
import type { CreateKycProfileDto, UpdateKycProfileDto } from "../dto/kyc.dto";
import {
  toKycAuditSnapshot,
  toKycProfileView,
  type KycProfileView,
} from "./kyc-views";

const EDITABLE_STATUSES: ReadonlySet<KycStatus> = new Set([
  KycStatus.NOT_STARTED,
  KycStatus.DRAFT,
  KycStatus.REJECTED,
]);

const SUBMITTABLE_STATUSES: ReadonlySet<KycStatus> = new Set([
  KycStatus.NOT_STARTED,
  KycStatus.DRAFT,
  KycStatus.REJECTED,
]);

type ProfileWithDocuments = KycProfile & { documents: KycDocument[] };

/**
 * TEAM_MEMBER (and any authenticated internal user) self-service KYC
 * collection. Ownership is always `actor.id` within `actor.organizationId`
 * — no userId path param, no cross-user access, no kyc.* permissions.
 */
@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async getOwn(actor: AuthenticatedUser): Promise<KycProfileView> {
    const profile = await this.findOwnOrThrow(actor);
    return toKycProfileView(profile);
  }

  async createOwn(
    actor: AuthenticatedUser,
    dto: CreateKycProfileDto
  ): Promise<KycProfileView> {
    const existing = await this.prisma.kycProfile.findFirst({
      where: {
        organization_id: actor.organizationId,
        user_id: actor.id,
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: "KYC_ALREADY_EXISTS",
        message: "A KYC profile already exists for this user.",
      });
    }

    let created: ProfileWithDocuments;
    try {
      created = await this.prisma.kycProfile.create({
        data: {
          organization_id: actor.organizationId,
          user_id: actor.id,
          status: KycStatus.DRAFT,
          ...this.mapWritableFields(dto),
        },
        include: { documents: true },
      });
    } catch (error) {
      // Concurrent create race on user_id unique.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException({
          code: "KYC_ALREADY_EXISTS",
          message: "A KYC profile already exists for this user.",
        });
      }
      throw error;
    }

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.KYC_CREATED,
      entityType: "KycProfile",
      entityId: created.id,
      after: toKycAuditSnapshot(created),
    });

    return toKycProfileView(created);
  }

  async updateOwn(
    actor: AuthenticatedUser,
    dto: UpdateKycProfileDto
  ): Promise<KycProfileView> {
    const profile = await this.findOwnOrThrow(actor);
    this.assertEditable(profile);

    const nextStatus =
      profile.status === KycStatus.REJECTED ? KycStatus.DRAFT : profile.status;

    const updated = await this.prisma.kycProfile.update({
      where: { id: profile.id },
      data: {
        ...this.mapWritableFields(dto),
        status: nextStatus,
        ...(profile.status === KycStatus.REJECTED
          ? { rejection_reason: null, rejected_at: null }
          : {}),
      },
      include: { documents: true },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.KYC_UPDATED,
      entityType: "KycProfile",
      entityId: updated.id,
      before: toKycAuditSnapshot(profile),
      after: toKycAuditSnapshot(updated),
    });

    return toKycProfileView(updated);
  }

  /**
   * Atomically validates required fields + documents, then transitions
   * DRAFT/NOT_STARTED/REJECTED → UNDER_REVIEW (SUBMITTED → UNDER_REVIEW
   * immediately per product decision D).
   */
  async submitOwn(actor: AuthenticatedUser): Promise<KycProfileView> {
    const submitted = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status::text AS status
        FROM kyc_profiles
        WHERE user_id = ${actor.id}::uuid
          AND organization_id = ${actor.organizationId}::uuid
        FOR UPDATE
      `;

      if (!locked[0]) {
        throw new NotFoundException({
          code: "NOT_FOUND",
          message: "KYC profile not found.",
        });
      }

      const profile = await tx.kycProfile.findFirstOrThrow({
        where: {
          id: locked[0].id,
          organization_id: actor.organizationId,
          user_id: actor.id,
        },
        include: { documents: true },
      });

      if (!SUBMITTABLE_STATUSES.has(profile.status)) {
        throw new ConflictException({
          code: "KYC_NOT_SUBMITTABLE",
          message: `KYC profile in status ${profile.status} cannot be submitted.`,
        });
      }

      this.assertSubmissionComplete(profile);

      return tx.kycProfile.update({
        where: { id: profile.id },
        data: {
          // Decision D: SUBMITTED → UNDER_REVIEW immediately; persist final state.
          status: KycStatus.UNDER_REVIEW,
          submitted_at: new Date(),
          rejection_reason: null,
          rejected_at: null,
          verified_at: null,
        },
        include: { documents: true },
      });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.KYC_SUBMITTED,
      entityType: "KycProfile",
      entityId: submitted.id,
      after: toKycAuditSnapshot(submitted),
    });

    return toKycProfileView(submitted);
  }

  private async findOwnOrThrow(
    actor: AuthenticatedUser
  ): Promise<ProfileWithDocuments> {
    const profile = await this.prisma.kycProfile.findFirst({
      where: {
        organization_id: actor.organizationId,
        user_id: actor.id,
      },
      include: { documents: true },
    });
    if (!profile) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "KYC profile not found.",
      });
    }
    return profile;
  }

  private assertEditable(profile: KycProfile): void {
    if (!EDITABLE_STATUSES.has(profile.status)) {
      throw new ConflictException({
        code: "KYC_IMMUTABLE",
        message: `KYC profile in status ${profile.status} cannot be edited.`,
      });
    }
  }

  private assertSubmissionComplete(profile: ProfileWithDocuments): void {
    const missing: string[] = [];

    if (!profile.legal_name?.trim()) missing.push("legalName");
    if (!profile.date_of_birth) missing.push("dateOfBirth");
    if (!profile.mobile?.trim()) missing.push("mobile");
    if (!profile.address_line1?.trim()) missing.push("addressLine1");
    if (!profile.city?.trim()) missing.push("city");
    if (!profile.state?.trim()) missing.push("state");
    if (!profile.postal_code?.trim()) missing.push("postalCode");
    if (!profile.pan?.trim()) missing.push("pan");
    if (!profile.government_id_type) missing.push("governmentIdType");
    if (!profile.government_id_number?.trim()) missing.push("governmentIdNumber");

    const activeDocs = profile.documents.filter(
      (d) => d.status === KycDocumentStatus.UPLOADED
    );
    if (!activeDocs.some((d) => d.document_type === KycDocumentType.PAN_CARD)) {
      missing.push("document:PAN_CARD");
    }
    if (
      !activeDocs.some((d) => d.document_type === KycDocumentType.GOVERNMENT_ID)
    ) {
      missing.push("document:GOVERNMENT_ID");
    }

    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        code: "KYC_INCOMPLETE",
        message: "KYC profile is incomplete and cannot be submitted.",
        details: { missing },
      });
    }
  }

  private mapWritableFields(dto: CreateKycProfileDto | UpdateKycProfileDto): {
    legal_name?: string;
    date_of_birth?: Date;
    mobile?: string;
    address_line1?: string;
    address_line2?: string | null;
    city?: string;
    state?: string;
    postal_code?: string;
    pan?: string;
    government_id_type?: KycGovernmentIdType;
    government_id_number?: string;
  } {
    const data: {
      legal_name?: string;
      date_of_birth?: Date;
      mobile?: string;
      address_line1?: string;
      address_line2?: string | null;
      city?: string;
      state?: string;
      postal_code?: string;
      pan?: string;
      government_id_type?: KycGovernmentIdType;
      government_id_number?: string;
    } = {};

    if (dto.legalName !== undefined) data.legal_name = dto.legalName;
    if (dto.dateOfBirth !== undefined) {
      data.date_of_birth = new Date(`${dto.dateOfBirth}T00:00:00.000Z`);
    }
    if (dto.mobile !== undefined) data.mobile = dto.mobile;
    if (dto.addressLine1 !== undefined) data.address_line1 = dto.addressLine1;
    if (dto.addressLine2 !== undefined) data.address_line2 = dto.addressLine2;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.state !== undefined) data.state = dto.state;
    if (dto.postalCode !== undefined) data.postal_code = dto.postalCode;
    if (dto.pan !== undefined) data.pan = dto.pan.toUpperCase();
    if (dto.governmentIdType !== undefined) {
      data.government_id_type = dto.governmentIdType;
    }
    if (dto.governmentIdNumber !== undefined) {
      data.government_id_number = dto.governmentIdNumber;
    }

    return data;
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ActorType,
  KycDocumentStatus,
  KycDocumentType,
  KycStatus,
  Prisma,
  type KycDocument,
  type KycProfile,
} from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { AUDIT_ACTIONS, AuditService } from "../../shared/audit.service";
import {
  PRESIGNED_URL_TTL_SECONDS,
  StorageService,
  type PresignedDownloadResult,
  type PresignedUploadResult,
} from "../../shared/documents/services/storage.service";
import type {
  PresignKycDocumentDto,
  RegisterKycDocumentDto,
} from "../dto/kyc.dto";
import { toKycDocumentView, type KycDocumentView } from "./kyc-views";

/**
 * KYC-only MIME allowlist — stricter than StorageService's global set.
 * Does not weaken the global allowlist; applied at this boundary after
 * StorageService.assertValidFile.
 */
export const KYC_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const EDITABLE_STATUSES: ReadonlySet<KycStatus> = new Set([
  KycStatus.NOT_STARTED,
  KycStatus.DRAFT,
  KycStatus.REJECTED,
]);

/** Safe audit payload for KYC document events — no keys, URLs, or PII. */
export function toKycDocumentAuditSnapshot(
  doc: Pick<KycDocument, "id" | "document_type" | "status" | "mime_type" | "size_bytes" | "kyc_profile_id">
): Record<string, unknown> {
  return {
    documentId: doc.id,
    documentType: doc.document_type,
    status: doc.status,
    mimeType: doc.mime_type,
    sizeBytes: doc.size_bytes,
    kycProfileId: doc.kyc_profile_id,
  };
}

@Injectable()
export class KycDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService
  ) {}

  async presignUpload(
    actor: AuthenticatedUser,
    dto: PresignKycDocumentDto
  ): Promise<PresignedUploadResult & { documentType: KycDocumentType }> {
    await this.findOwnEditableProfile(actor);
    this.assertKycMime(dto.mimeType);
    // Size + global MIME (never weaken StorageService); KYC MIME already checked.
    this.storage.assertValidFile(dto.mimeType, dto.sizeBytes);

    const upload = await this.storage.generateUploadUrl(
      actor.organizationId,
      dto.filename,
      dto.mimeType,
      dto.sizeBytes
    );

    return { ...upload, documentType: dto.documentType };
  }

  async registerUpload(
    actor: AuthenticatedUser,
    dto: RegisterKycDocumentDto
  ): Promise<KycDocumentView> {
    const profile = await this.findOwnEditableProfile(actor);
    this.assertKycMime(dto.mimeType);
    this.storage.assertValidFile(dto.mimeType, dto.sizeBytes);
    this.storage.assertValidStorageKeyForOrg(dto.storageKey, actor.organizationId);

    const existingKycKey = await this.prisma.kycDocument.findFirst({
      where: { storage_key: dto.storageKey },
      select: { id: true },
    });
    if (existingKycKey) {
      throw new ConflictException({
        code: "STORAGE_KEY_ALREADY_REGISTERED",
        message: "This storageKey is already registered to a KYC document.",
      });
    }

    // Prevent rebinding a CRM Document key into KYC metadata.
    const existingCrmKey = await this.prisma.document.findFirst({
      where: { storage_key: dto.storageKey },
      select: { id: true },
    });
    if (existingCrmKey) {
      throw new ConflictException({
        code: "STORAGE_KEY_ALREADY_REGISTERED",
        message: "This storageKey is already registered to a document.",
      });
    }

    await this.storage.assertObjectMatchesRegistration(
      dto.storageKey,
      dto.mimeType,
      dto.sizeBytes
    );

    let created: KycDocument;
    try {
      created = await this.prisma.kycDocument.create({
        data: {
          organization_id: actor.organizationId,
          kyc_profile_id: profile.id,
          document_type: dto.documentType,
          storage_key: dto.storageKey,
          filename: this.storage.sanitizeFilename(dto.filename),
          mime_type: dto.mimeType.toLowerCase().trim(),
          size_bytes: dto.sizeBytes,
          status: KycDocumentStatus.UPLOADED,
        },
      });
    } catch (error) {
      // Concurrent register race on storage_key unique (K8 hardening).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException({
          code: "STORAGE_KEY_ALREADY_REGISTERED",
          message: "This storageKey is already registered to a KYC document.",
        });
      }
      throw error;
    }

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: ActorType.USER,
      actorId: actor.id,
      action: AUDIT_ACTIONS.KYC_DOCUMENT_UPLOADED,
      entityType: "KycDocument",
      entityId: created.id,
      after: toKycDocumentAuditSnapshot(created),
    });

    return toKycDocumentView(created);
  }

  async getDownloadUrl(
    actor: AuthenticatedUser,
    documentId: string
  ): Promise<PresignedDownloadResult> {
    const doc = await this.findOwnUploadedDocument(actor, documentId);

    return this.storage.generateDownloadUrl(
      doc.storage_key,
      doc.filename,
      doc.mime_type
    );
  }

  async remove(
    actor: AuthenticatedUser,
    documentId: string
  ): Promise<KycDocumentView> {
    const profile = await this.findOwnEditableProfile(actor);
    const doc = await this.findOwnDocument(actor, documentId);

    if (doc.kyc_profile_id !== profile.id) {
      // Defense in depth — findOwnDocument already scopes to own profile.
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "KYC document not found.",
      });
    }

    if (doc.status === KycDocumentStatus.REMOVED) {
      throw new ConflictException({
        code: "KYC_DOCUMENT_ALREADY_REMOVED",
        message: "This KYC document is already removed.",
      });
    }

    const updated = await this.prisma.kycDocument.update({
      where: { id: doc.id },
      data: { status: KycDocumentStatus.REMOVED },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: ActorType.USER,
      actorId: actor.id,
      action: AUDIT_ACTIONS.KYC_DOCUMENT_REMOVED,
      entityType: "KycDocument",
      entityId: updated.id,
      before: toKycDocumentAuditSnapshot(doc),
      after: toKycDocumentAuditSnapshot(updated),
    });

    // Soft-remove only — matches DocumentsService (no R2 purge inventing).
    return toKycDocumentView(updated);
  }

  /** Exported for tests asserting TTL contract. */
  signedUrlTtlSeconds(): number {
    return PRESIGNED_URL_TTL_SECONDS;
  }

  private assertKycMime(mimeType: string): void {
    const normalized = mimeType.toLowerCase().trim();
    if (!KYC_ALLOWED_MIME_TYPES.has(normalized)) {
      throw new BadRequestException({
        code: "UNSUPPORTED_MIME_TYPE",
        message:
          `MIME type "${mimeType}" is not allowed for KYC documents. ` +
          "Allowed types: application/pdf, image/jpeg, image/png, image/webp.",
      });
    }
  }

  private async findOwnEditableProfile(
    actor: AuthenticatedUser
  ): Promise<KycProfile> {
    const profile = await this.prisma.kycProfile.findFirst({
      where: {
        organization_id: actor.organizationId,
        user_id: actor.id,
      },
    });
    if (!profile) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "KYC profile not found.",
      });
    }
    if (!EDITABLE_STATUSES.has(profile.status)) {
      throw new ConflictException({
        code: "KYC_IMMUTABLE",
        message: `KYC profile in status ${profile.status} cannot be modified.`,
      });
    }
    return profile;
  }

  private async findOwnDocument(
    actor: AuthenticatedUser,
    documentId: string
  ): Promise<KycDocument> {
    const profile = await this.prisma.kycProfile.findFirst({
      where: {
        organization_id: actor.organizationId,
        user_id: actor.id,
      },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "KYC document not found.",
      });
    }

    const doc = await this.prisma.kycDocument.findFirst({
      where: {
        id: documentId,
        organization_id: actor.organizationId,
        kyc_profile_id: profile.id,
      },
    });
    if (!doc) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "KYC document not found.",
      });
    }
    return doc;
  }

  private async findOwnUploadedDocument(
    actor: AuthenticatedUser,
    documentId: string
  ): Promise<KycDocument> {
    const doc = await this.findOwnDocument(actor, documentId);
    if (doc.status !== KycDocumentStatus.UPLOADED) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "KYC document not found.",
      });
    }
    return doc;
  }
}

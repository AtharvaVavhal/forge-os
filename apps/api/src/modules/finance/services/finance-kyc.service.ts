import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  ActorType,
  KycDocumentStatus,
  KycStatus,
  type KycDocument,
  type KycProfile,
  type PayoutProfile,
  type User,
  type Prisma,
} from "@prisma/client";
import {
  buildOffsetMeta,
  offsetSkipTake,
  type ListEnvelope,
} from "../../../common/pagination/offset-pagination";
import { PrismaService } from "../../../database/prisma.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { AUDIT_ACTIONS, AuditService } from "../../shared/audit.service";
import {
  StorageService,
  type PresignedDownloadResult,
} from "../../shared/documents/services/storage.service";
import {
  FinanceKycReviewAction,
  type ListFinanceKycQueryDto,
  type ReviewFinanceKycDto,
} from "../dto/finance-kyc.dto";
import {
  toFinanceKycDetailView,
  toFinanceKycListItem,
  toFinanceKycReviewAuditSnapshot,
  type FinanceKycDetailView,
  type FinanceKycListItem,
} from "./finance-kyc-views";

const LIST_STATUSES: ReadonlySet<KycStatus> = new Set([
  KycStatus.UNDER_REVIEW,
  KycStatus.REJECTED,
  KycStatus.VERIFIED,
]);

const REVIEWABLE_STATUS = KycStatus.UNDER_REVIEW;

type ProfileWithUser = KycProfile & { user: Pick<User, "id" | "name" | "email"> };

type ProfileDetail = ProfileWithUser & { documents: KycDocument[] };

/**
 * Finance KYC review — org-scoped, finance.manage only.
 * Concurrent reviews use updateMany conditioned on UNDER_REVIEW.
 */
@Injectable()
export class FinanceKycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: ListFinanceKycQueryDto
  ): Promise<ListEnvelope<FinanceKycListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    // Default prioritizes the review queue (UNDER_REVIEW). Callers may
    // pass status=REJECTED|VERIFIED|UNDER_REVIEW for other queues.
    const status: KycStatus =
      query.status && LIST_STATUSES.has(query.status)
        ? query.status
        : KycStatus.UNDER_REVIEW;

    const where: Prisma.KycProfileWhereInput = {
      organization_id: actor.organizationId,
      status,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.kycProfile.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ submitted_at: "desc" }, { created_at: "desc" }],
        ...offsetSkipTake(page, pageSize),
      }),
      this.prisma.kycProfile.count({ where }),
    ]);

    return {
      data: rows.map(toFinanceKycListItem),
      meta: { pagination: buildOffsetMeta(page, pageSize, total) },
    };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<FinanceKycDetailView> {
    const profile = await this.findOrgProfileOrThrow(actor, id);
    const payout = await this.findPayoutForUser(actor.organizationId, profile.user_id);
    return toFinanceKycDetailView(profile, payout);
  }

  async review(
    actor: AuthenticatedUser,
    id: string,
    dto: ReviewFinanceKycDto
  ): Promise<FinanceKycDetailView> {
    if (dto.action === FinanceKycReviewAction.REJECT) {
      const reason = dto.rejectionReason?.trim();
      if (!reason) {
        throw new BadRequestException({
          code: "KYC_REJECTION_REASON_REQUIRED",
          message: "A rejection reason is required.",
        });
      }
    }

    const existing = await this.findOrgProfileOrThrow(actor, id);
    if (existing.status !== REVIEWABLE_STATUS) {
      throw new UnprocessableEntityException({
        code: "KYC_NOT_REVIEWABLE",
        message: "Only KYC profiles under review can be approved or rejected.",
        details: { status: existing.status },
      });
    }

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: ActorType.USER,
      actorId: actor.id,
      action: AUDIT_ACTIONS.KYC_REVIEW_STARTED,
      entityType: "KycProfile",
      entityId: id,
      before: toFinanceKycReviewAuditSnapshot({
        kycProfileId: id,
        status: existing.status,
        reviewerUserId: actor.id,
      }),
      after: toFinanceKycReviewAuditSnapshot({
        kycProfileId: id,
        status: existing.status,
        reviewerUserId: actor.id,
      }),
    });

    const now = new Date();
    let updateData: Prisma.KycProfileUpdateManyMutationInput;
    let resultAction: typeof AUDIT_ACTIONS.KYC_VERIFIED | typeof AUDIT_ACTIONS.KYC_REJECTED;
    let resultStatus: KycStatus;

    if (dto.action === FinanceKycReviewAction.APPROVE) {
      updateData = {
        status: KycStatus.VERIFIED,
        verified_at: now,
        rejected_at: null,
        rejection_reason: null,
      };
      resultAction = AUDIT_ACTIONS.KYC_VERIFIED;
      resultStatus = KycStatus.VERIFIED;
    } else {
      updateData = {
        status: KycStatus.REJECTED,
        rejected_at: now,
        rejection_reason: dto.rejectionReason!.trim(),
        verified_at: null,
      };
      resultAction = AUDIT_ACTIONS.KYC_REJECTED;
      resultStatus = KycStatus.REJECTED;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.kycProfile.updateMany({
        where: {
          id,
          organization_id: actor.organizationId,
          status: REVIEWABLE_STATUS,
        },
        data: updateData,
      });

      if (result.count !== 1) {
        throw new ConflictException({
          code: "KYC_REVIEW_CONFLICT",
          message:
            "This KYC profile was already reviewed by someone else. Reload and try again.",
        });
      }

      return tx.kycProfile.findFirstOrThrow({
        where: { id, organization_id: actor.organizationId },
        include: {
          user: { select: { id: true, name: true, email: true } },
          documents: true,
        },
      });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: ActorType.USER,
      actorId: actor.id,
      action: resultAction,
      entityType: "KycProfile",
      entityId: id,
      before: toFinanceKycReviewAuditSnapshot({
        kycProfileId: id,
        status: KycStatus.UNDER_REVIEW,
        reviewerUserId: actor.id,
      }),
      after: toFinanceKycReviewAuditSnapshot({
        kycProfileId: id,
        status: resultStatus,
        reviewerUserId: actor.id,
        rejectionReasonProvided:
          dto.action === FinanceKycReviewAction.REJECT ? true : undefined,
      }),
    });

    const payout = await this.findPayoutForUser(actor.organizationId, updated.user_id);
    return toFinanceKycDetailView(updated, payout);
  }

  async getDocumentDownloadUrl(
    actor: AuthenticatedUser,
    kycProfileId: string,
    documentId: string
  ): Promise<PresignedDownloadResult> {
    const profile = await this.prisma.kycProfile.findFirst({
      where: {
        id: kycProfileId,
        organization_id: actor.organizationId,
      },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "KYC profile not found.",
      });
    }

    const doc = await this.prisma.kycDocument.findFirst({
      where: {
        id: documentId,
        organization_id: actor.organizationId,
        kyc_profile_id: kycProfileId,
        status: KycDocumentStatus.UPLOADED,
      },
    });
    if (!doc) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "KYC document not found.",
      });
    }

    // Short-lived signed URL — never persisted, never logged.
    return this.storage.generateDownloadUrl(
      doc.storage_key,
      doc.filename,
      doc.mime_type
    );
  }

  private async findOrgProfileOrThrow(
    actor: AuthenticatedUser,
    id: string
  ): Promise<ProfileDetail> {
    const profile = await this.prisma.kycProfile.findFirst({
      where: { id, organization_id: actor.organizationId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        documents: true,
      },
    });
    if (!profile) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "KYC profile not found.",
      });
    }
    return profile;
  }

  private async findPayoutForUser(
    organizationId: string,
    userId: string
  ): Promise<PayoutProfile | null> {
    return this.prisma.payoutProfile.findFirst({
      where: { organization_id: organizationId, user_id: userId },
    });
  }
}

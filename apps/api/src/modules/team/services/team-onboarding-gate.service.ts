import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { KycDocumentStatus, KycDocumentType, KycStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";

type DbClient = PrismaService | Prisma.TransactionClient;

export interface OnboardingRequirementFailure {
  code: "PAYOUT_PROFILE_INCOMPLETE";
  missing: string[];
}

/**
 * Server-side TEAM_MEMBER onboarding gate.
 *
 * Product decision (post-K12): financial KYC (PAN, government ID, document
 * upload, Finance review) is deliberately NOT part of first-run onboarding
 * — it happens later, gated at first withdrawal instead (see
 * `TeamEarningsService.createPayoutRequest`, which calls
 * `assertKycVerifiedForWithdrawal` below). Onboarding completion never
 * inspects `KycProfile` at all, in any status. Only a complete dual payout
 * profile (bank fields + upiId + registered UPI QR) is still required —
 * unchanged from before.
 */
@Injectable()
export class TeamOnboardingGateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Throws `ONBOARDING_REQUIREMENTS_INCOMPLETE` with safe `details.requirements`
   * when the payout profile is not ready. No-op when it passes.
   */
  async assertTeamMemberReady(
    organizationId: string,
    userId: string,
    db: DbClient = this.prisma
  ): Promise<void> {
    const requirements: OnboardingRequirementFailure[] = [];

    const payoutMissing = await this.collectPayoutMissing(
      db,
      organizationId,
      userId
    );
    if (payoutMissing.length > 0) {
      requirements.push({
        code: "PAYOUT_PROFILE_INCOMPLETE",
        missing: payoutMissing,
      });
    }

    if (requirements.length > 0) {
      throw new UnprocessableEntityException({
        code: "ONBOARDING_REQUIREMENTS_INCOMPLETE",
        message:
          "Team member onboarding requires a complete payout profile (bank transfer, UPI ID, and UPI QR).",
        details: { requirements },
      });
    }
  }

  /**
   * `POST /team/payouts` precondition (Phase 3 of the K5 onboarding
   * redesign): the requesting member's KYC must be `VERIFIED` with both
   * required documents still active (`UPLOADED`, not `REMOVED`). This is
   * the ONLY place KYC becomes mandatory for a TEAM_MEMBER — deliberately
   * long after onboarding, at first withdrawal. Thrown as a distinct
   * `KYC_REQUIRED_FOR_WITHDRAWAL` code (never conflated with onboarding's
   * `ONBOARDING_REQUIREMENTS_INCOMPLETE`) so the frontend can route the
   * member into financial verification specifically.
   */
  async assertKycVerifiedForWithdrawal(
    organizationId: string,
    userId: string,
    db: DbClient = this.prisma
  ): Promise<void> {
    const profile = await db.kycProfile.findFirst({
      where: { organization_id: organizationId, user_id: userId },
      include: { documents: true },
    });

    const missing: string[] = [];
    if (!profile || profile.status !== KycStatus.VERIFIED) {
      missing.push("kyc_status");
    }
    const activeDocs = (profile?.documents ?? []).filter(
      (d) => d.status === KycDocumentStatus.UPLOADED
    );
    if (!activeDocs.some((d) => d.document_type === KycDocumentType.PAN_CARD)) {
      missing.push("PAN_CARD");
    }
    if (!activeDocs.some((d) => d.document_type === KycDocumentType.GOVERNMENT_ID)) {
      missing.push("GOVERNMENT_ID");
    }

    if (missing.length > 0) {
      throw new ConflictException({
        code: "KYC_REQUIRED_FOR_WITHDRAWAL",
        message: "Complete financial verification before requesting a withdrawal.",
        details: { missing },
      });
    }
  }

  private async collectPayoutMissing(
    db: DbClient,
    organizationId: string,
    userId: string
  ): Promise<string[]> {
    const profile = await db.payoutProfile.findFirst({
      where: { organization_id: organizationId, user_id: userId },
    });

    if (!profile) {
      return [
        "payout_profile",
        "accountHolderName",
        "bankName",
        "accountNumber",
        "ifsc",
        "upiId",
        "upiQr",
      ];
    }

    const missing: string[] = [];
    if (!profile.account_holder_name?.trim()) missing.push("accountHolderName");
    if (!profile.bank_name?.trim()) missing.push("bankName");
    if (!profile.account_number?.trim()) missing.push("accountNumber");
    if (!profile.ifsc?.trim()) missing.push("ifsc");
    if (!profile.upi_id?.trim()) missing.push("upiId");
    // QR must be a real registered R2 object (storage_key set after HeadObject).
    if (!profile.upi_qr_storage_key?.trim()) missing.push("upiQr");

    return missing;
  }
}

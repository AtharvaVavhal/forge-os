import {
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  KycDocumentStatus,
  KycDocumentType,
  KycStatus,
  type Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";

/** KYC statuses that allow TEAM_MEMBER onboarding completion (not VERIFIED-only). */
export const ONBOARDING_ALLOWED_KYC_STATUSES: ReadonlySet<KycStatus> = new Set([
  KycStatus.SUBMITTED,
  KycStatus.UNDER_REVIEW,
  KycStatus.VERIFIED,
]);

type DbClient = PrismaService | Prisma.TransactionClient;

export interface OnboardingRequirementFailure {
  code: "KYC_INCOMPLETE" | "PAYOUT_PROFILE_INCOMPLETE";
  missing: string[];
}

/**
 * Server-side TEAM_MEMBER onboarding gate.
 * FINAL: requires KYC (status + docs) AND complete dual payout
 * (bank fields + upiId + registered UPI QR storage object).
 */
@Injectable()
export class TeamOnboardingGateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Throws `ONBOARDING_REQUIREMENTS_INCOMPLETE` with safe `details.requirements`
   * when KYC and/or payout are not ready. No-op when both pass.
   */
  async assertTeamMemberReady(
    organizationId: string,
    userId: string,
    db: DbClient = this.prisma
  ): Promise<void> {
    const requirements: OnboardingRequirementFailure[] = [];

    const kycMissing = await this.collectKycMissing(db, organizationId, userId);
    if (kycMissing.length > 0) {
      requirements.push({ code: "KYC_INCOMPLETE", missing: kycMissing });
    }

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
          "Team member onboarding requires a submitted KYC profile with required documents and a complete payout profile (bank transfer, UPI ID, and UPI QR).",
        details: { requirements },
      });
    }
  }

  private async collectKycMissing(
    db: DbClient,
    organizationId: string,
    userId: string
  ): Promise<string[]> {
    const missing: string[] = [];
    const profile = await db.kycProfile.findFirst({
      where: { organization_id: organizationId, user_id: userId },
      include: { documents: true },
    });

    if (!profile) {
      return ["kyc_profile", "PAN_CARD", "GOVERNMENT_ID"];
    }

    if (!ONBOARDING_ALLOWED_KYC_STATUSES.has(profile.status)) {
      if (
        profile.status === KycStatus.DRAFT ||
        profile.status === KycStatus.NOT_STARTED
      ) {
        missing.push("personal_information");
      } else {
        missing.push("kyc_status");
      }
    }

    const activeDocs = profile.documents.filter(
      (d) => d.status === KycDocumentStatus.UPLOADED
    );
    if (!activeDocs.some((d) => d.document_type === KycDocumentType.PAN_CARD)) {
      missing.push("PAN_CARD");
    }
    if (
      !activeDocs.some((d) => d.document_type === KycDocumentType.GOVERNMENT_ID)
    ) {
      missing.push("GOVERNMENT_ID");
    }

    return missing;
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

import type { StatusTone } from "@/components/feedback/status-badge";
import type { KycStatus } from "../api/types";

export interface KycStatusCopy {
  label: string;
  tone: StatusTone;
  message: string;
}

/**
 * Single source of truth for how a KYC status reads outside the onboarding
 * flow itself (dashboard card, Profile verification tab) — one status→copy
 * mapping instead of duplicating strings across surfaces.
 */
export function kycStatusCopy(status: KycStatus | null | undefined): KycStatusCopy {
  switch (status) {
    case "DRAFT":
      return {
        label: "In progress",
        tone: "warning",
        message: "Your identity verification is incomplete.",
      };
    case "SUBMITTED":
      return {
        label: "Submitted",
        tone: "info",
        message: "Your KYC documents have been submitted and are awaiting review.",
      };
    case "UNDER_REVIEW":
      return {
        label: "Under review",
        tone: "info",
        message: "Your KYC documents have been submitted and are currently under review.",
      };
    case "VERIFIED":
      return {
        label: "Verified",
        tone: "success",
        message: "Your identity verification is complete.",
      };
    case "REJECTED":
      return {
        label: "Action required",
        tone: "danger",
        message: "Your KYC submission needs attention before it can be verified.",
      };
    case "NOT_STARTED":
    default:
      return {
        label: "Not started",
        tone: "neutral",
        message: "You haven’t started identity verification yet.",
      };
  }
}

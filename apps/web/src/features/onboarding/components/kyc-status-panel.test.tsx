import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, ApiNetworkError } from "@forge/api-client";
import { renderWithShell } from "@/test/test-utils";
import { KycStatusPanel } from "./kyc-status-panel";
import type { KycProfile } from "../api/types";

vi.mock("../api/kyc-api", () => ({
  getOwnKycProfile: vi.fn(),
}));

import { getOwnKycProfile } from "../api/kyc-api";

const mockGetOwnKycProfile = vi.mocked(getOwnKycProfile);

function kycProfile(overrides: Partial<KycProfile> = {}): KycProfile {
  return {
    id: "kyc-1",
    status: "UNDER_REVIEW",
    legalName: "Priya Sharma",
    dateOfBirth: "1995-01-01",
    mobile: "+919876543210",
    addressLine1: "1 MG Road",
    addressLine2: null,
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    pan: "ABCDE1234F",
    governmentIdType: "AADHAAR",
    governmentIdNumber: "123412341234",
    submittedAt: "2026-03-01T00:00:00.000Z",
    verifiedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    documents: [],
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockGetOwnKycProfile.mockReset();
});

describe("KycStatusPanel", () => {
  it("shows a loading state while fetching", () => {
    mockGetOwnKycProfile.mockReturnValue(new Promise(() => undefined));
    renderWithShell(<KycStatusPanel />);
    expect(screen.getByLabelText(/loading verification status/i)).toBeInTheDocument();
  });

  it("shows UNDER_REVIEW status and the submitted date", async () => {
    mockGetOwnKycProfile.mockResolvedValue(
      kycProfile({ status: "UNDER_REVIEW", submittedAt: "2026-03-01T00:00:00.000Z" })
    );
    renderWithShell(<KycStatusPanel />);
    expect(await screen.findByText("Under review")).toBeInTheDocument();
    expect(
      screen.getByText("Your KYC documents have been submitted and are currently under review.")
    ).toBeInTheDocument();
    expect(screen.getByText("Submitted on")).toBeInTheDocument();
  });

  it("shows VERIFIED status and the verified date", async () => {
    mockGetOwnKycProfile.mockResolvedValue(
      kycProfile({ status: "VERIFIED", verifiedAt: "2026-03-10T00:00:00.000Z" })
    );
    renderWithShell(<KycStatusPanel />);
    expect(await screen.findByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Your identity verification is complete.")).toBeInTheDocument();
    expect(screen.getByText("Verified on")).toBeInTheDocument();
  });

  it("shows REJECTED status with the rejection reason", async () => {
    mockGetOwnKycProfile.mockResolvedValue(
      kycProfile({
        status: "REJECTED",
        rejectedAt: "2026-03-08T00:00:00.000Z",
        rejectionReason: "Address proof does not match the submitted address.",
      })
    );
    renderWithShell(<KycStatusPanel />);
    expect(await screen.findByText("Action required")).toBeInTheDocument();
    expect(
      screen.getByText("Address proof does not match the submitted address.")
    ).toBeInTheDocument();
  });

  it("shows NOT_STARTED messaging when no KYC profile exists", async () => {
    mockGetOwnKycProfile.mockResolvedValue(null);
    renderWithShell(<KycStatusPanel />);
    expect(await screen.findByText("Not started")).toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    mockGetOwnKycProfile.mockRejectedValue(
      new ApiClientError(500, { code: "INTERNAL", message: "boom", requestId: "req-1" })
    );
    renderWithShell(<KycStatusPanel />);
    expect(
      await screen.findByText("The service is temporarily unavailable. Try again shortly.")
    ).toBeInTheDocument();
  });

  it("shows a network error state distinctly", async () => {
    mockGetOwnKycProfile.mockRejectedValue(new ApiNetworkError(new Error("offline")));
    renderWithShell(<KycStatusPanel />);
    expect(
      await screen.findByText("We couldn’t reach the API. Check your connection and try again.")
    ).toBeInTheDocument();
  });

  it("shows a Start verification CTA linking to /verification when nothing has been submitted", async () => {
    mockGetOwnKycProfile.mockResolvedValue(null);
    renderWithShell(<KycStatusPanel />);
    const cta = await screen.findByRole("link", { name: /start verification/i });
    expect(cta).toHaveAttribute("href", "/verification");
  });

  it("shows a Resubmit verification CTA when rejected", async () => {
    mockGetOwnKycProfile.mockResolvedValue(kycProfile({ status: "REJECTED", rejectionReason: "Blurry photo." }));
    renderWithShell(<KycStatusPanel />);
    const cta = await screen.findByRole("link", { name: /resubmit verification/i });
    expect(cta).toHaveAttribute("href", "/verification");
  });

  it("shows no CTA once submitted — nothing left to act on until Finance reviews it", async () => {
    mockGetOwnKycProfile.mockResolvedValue(kycProfile({ status: "UNDER_REVIEW" }));
    renderWithShell(<KycStatusPanel />);
    await screen.findByText("Under review");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows no CTA once verified", async () => {
    mockGetOwnKycProfile.mockResolvedValue(kycProfile({ status: "VERIFIED", verifiedAt: "2026-03-10T00:00:00.000Z" }));
    renderWithShell(<KycStatusPanel />);
    await screen.findByText("Verified");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("never renders PAN, government ID, documents, or payout data", async () => {
    mockGetOwnKycProfile.mockResolvedValue(
      kycProfile({
        status: "UNDER_REVIEW",
        pan: "ABCDE1234F",
        governmentIdNumber: "123412341234",
        legalName: "Priya Sharma",
      })
    );
    renderWithShell(<KycStatusPanel />);
    await screen.findByText("Under review");
    expect(screen.queryByText("ABCDE1234F")).not.toBeInTheDocument();
    expect(screen.queryByText("123412341234")).not.toBeInTheDocument();
    expect(screen.queryByText("Priya Sharma")).not.toBeInTheDocument();
  });
});

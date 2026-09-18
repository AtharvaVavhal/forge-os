import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./dashboard-page";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError, ApiNetworkError } from "@forge/api-client";
import type { KycProfile } from "@/features/onboarding/api/types";

vi.mock("@/features/crm/api/crm-api", () => ({
  listProjects: vi.fn(),
  listForgeFundEntries: vi.fn(),
  getForgeFundBalance: vi.fn(),
}));

vi.mock("@/features/onboarding/api/kyc-api", () => ({
  getOwnKycProfile: vi.fn(),
}));

import { getForgeFundBalance, listForgeFundEntries, listProjects } from "@/features/crm/api/crm-api";
import { getOwnKycProfile } from "@/features/onboarding/api/kyc-api";

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

const teamMember = createAuthContext({ role: "TEAM_MEMBER", permissions: [] });

describe("Dashboard", () => {
  beforeEach(() => {
    vi.mocked(listProjects).mockReset();
    vi.mocked(listForgeFundEntries).mockReset();
    vi.mocked(getForgeFundBalance).mockReset();
    vi.mocked(getOwnKycProfile).mockReset();
  });

  it("renders the composition without invented metrics", async () => {
    vi.mocked(listProjects).mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    vi.mocked(getForgeFundBalance).mockResolvedValue("0.00");
    vi.mocked(listForgeFundEntries).mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0 });

    renderWithShell(
      <DashboardPage />,
      createAuthContext({ role: "FOUNDER_ADMIN", permissions: ["*"] })
    );

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Key indicators" })).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("₹4.82L")).not.toBeInTheDocument();
    expect(await screen.findByText("No projects")).toBeInTheDocument();
  });

  it("shows an unavailable state when the projects module 404s", async () => {
    vi.mocked(listProjects).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    vi.mocked(getForgeFundBalance).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    vi.mocked(listForgeFundEntries).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );

    renderWithShell(
      <DashboardPage />,
      createAuthContext({ role: "FOUNDER_ADMIN", permissions: ["*"] })
    );

    expect(await screen.findByText("Projects API unavailable")).toBeInTheDocument();
  });

  it("hides Forge Fund without forge_fund.read", async () => {
    vi.mocked(listProjects).mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    renderWithShell(
      <DashboardPage />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "projects.read"] })
    );
    await screen.findByText("No projects");
    expect(screen.queryByRole("heading", { name: "Forge Fund" })).not.toBeInTheDocument();
  });

  it("shows loading skeletons while project data is in flight", () => {
    vi.mocked(listProjects).mockImplementation(() => new Promise(() => undefined));
    vi.mocked(getForgeFundBalance).mockImplementation(() => new Promise(() => undefined));
    vi.mocked(listForgeFundEntries).mockImplementation(() => new Promise(() => undefined));
    renderWithShell(
      <DashboardPage />,
      createAuthContext({ role: "FOUNDER_ADMIN", permissions: ["*"] })
    );
    expect(screen.getAllByRole("status", { name: "Loading rows" }).length).toBeGreaterThan(0);
  });

  it("renders live project and forge-fund rows when the APIs return data", async () => {
    vi.mocked(listProjects).mockResolvedValue({
      items: [
        {
          id: "p1",
          name: "Atlas site",
          status: "ACTIVE",
          phase: "DEVELOPMENT",
          companyId: "c1",
          company: { id: "c1", name: "Acme" },
          ownerId: "user-1",
          deadline: "2026-04-01T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
    });
    vi.mocked(getForgeFundBalance).mockResolvedValue("12000.00");
    vi.mocked(listForgeFundEntries).mockResolvedValue({
      items: [
        {
          id: "e1",
          type: "CONTRIBUTION",
          amount: "12000.00",
          reason: "Payment contribution",
          sourceType: "payment",
          sourceId: "pay-1",
          approvedBy: null,
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 5,
      total: 1,
    });
    renderWithShell(
      <DashboardPage />,
      createAuthContext({ role: "FOUNDER_ADMIN", permissions: ["*"] })
    );
    expect(await screen.findByText("Atlas site")).toBeInTheDocument();
    expect(screen.getAllByText("₹12,000.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Payment contribution")).toBeInTheDocument();
  });

  it("shows a network error on the projects widget", async () => {
    vi.mocked(listProjects).mockRejectedValue(new ApiNetworkError(new Error("offline")));
    vi.mocked(getForgeFundBalance).mockResolvedValue("0.00");
    vi.mocked(listForgeFundEntries).mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0 });
    renderWithShell(
      <DashboardPage />,
      createAuthContext({ role: "FOUNDER_ADMIN", permissions: ["*"] })
    );
    expect(await screen.findByText("We couldn’t reach the API. Check your connection and try again.")).toBeInTheDocument();
  });
});

describe("Dashboard — KYC & Verification status (TEAM_MEMBER)", () => {
  beforeEach(() => {
    vi.mocked(listProjects).mockReset();
    vi.mocked(listForgeFundEntries).mockReset();
    vi.mocked(getForgeFundBalance).mockReset();
    vi.mocked(getOwnKycProfile).mockReset();
  });

  it("is not shown to non-TEAM_MEMBER roles", () => {
    renderWithShell(<DashboardPage />, createAuthContext({ role: "FOUNDER_ADMIN", permissions: [] }));
    expect(screen.queryByText("KYC & Verification")).not.toBeInTheDocument();
    expect(getOwnKycProfile).not.toHaveBeenCalled();
  });

  it("shows a loading state while the KYC profile is being fetched", () => {
    vi.mocked(getOwnKycProfile).mockReturnValue(new Promise(() => undefined));
    renderWithShell(<DashboardPage />, teamMember);
    expect(screen.getByLabelText(/loading verification status/i)).toBeInTheDocument();
  });

  it("shows the under-review message when status is UNDER_REVIEW", async () => {
    vi.mocked(getOwnKycProfile).mockResolvedValue(kycProfile({ status: "UNDER_REVIEW" }));
    renderWithShell(<DashboardPage />, teamMember);
    expect(await screen.findByText("Under review")).toBeInTheDocument();
    expect(
      screen.getByText("Your KYC documents have been submitted and are currently under review.")
    ).toBeInTheDocument();
  });

  it("shows verification-complete messaging when status is VERIFIED", async () => {
    vi.mocked(getOwnKycProfile).mockResolvedValue(
      kycProfile({ status: "VERIFIED", verifiedAt: "2026-03-05T00:00:00.000Z" })
    );
    renderWithShell(<DashboardPage />, teamMember);
    expect(await screen.findByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Your identity verification is complete.")).toBeInTheDocument();
  });

  it("shows action-required messaging and the rejection reason when status is REJECTED", async () => {
    vi.mocked(getOwnKycProfile).mockResolvedValue(
      kycProfile({ status: "REJECTED", rejectionReason: "PAN image is blurry." })
    );
    renderWithShell(<DashboardPage />, teamMember);
    expect(await screen.findByText("Action required")).toBeInTheDocument();
    expect(screen.getByText("PAN image is blurry.")).toBeInTheDocument();
  });

  it("shows not-started messaging when no KYC profile exists yet", async () => {
    vi.mocked(getOwnKycProfile).mockResolvedValue(null);
    renderWithShell(<DashboardPage />, teamMember);
    expect(await screen.findByText("Not started")).toBeInTheDocument();
    expect(screen.getByText("You haven’t started identity verification yet.")).toBeInTheDocument();
  });

  it("shows draft (in-progress) messaging when status is DRAFT", async () => {
    vi.mocked(getOwnKycProfile).mockResolvedValue(kycProfile({ status: "DRAFT" }));
    renderWithShell(<DashboardPage />, teamMember);
    expect(await screen.findByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Your identity verification is incomplete.")).toBeInTheDocument();
  });

  it("shows an error state when the KYC profile fails to load", async () => {
    vi.mocked(getOwnKycProfile).mockRejectedValue(new ApiNetworkError(new Error("offline")));
    renderWithShell(<DashboardPage />, teamMember);
    expect(
      await screen.findByText("We couldn’t reach the API. Check your connection and try again.")
    ).toBeInTheDocument();
  });

  it("links View verification to the Profile verification tab", async () => {
    vi.mocked(getOwnKycProfile).mockResolvedValue(kycProfile({ status: "UNDER_REVIEW" }));
    renderWithShell(<DashboardPage />, teamMember);
    const link = await screen.findByRole("link", { name: /view verification/i });
    expect(link).toHaveAttribute("href", "/settings/profile?tab=verification");
  });

  it("never renders PAN, government ID, or other sensitive KYC values", async () => {
    vi.mocked(getOwnKycProfile).mockResolvedValue(
      kycProfile({
        status: "UNDER_REVIEW",
        pan: "ABCDE1234F",
        governmentIdNumber: "123412341234",
      })
    );
    renderWithShell(<DashboardPage />, teamMember);
    await screen.findByText("Under review");
    expect(screen.queryByText("ABCDE1234F")).not.toBeInTheDocument();
    expect(screen.queryByText("123412341234")).not.toBeInTheDocument();
  });
});

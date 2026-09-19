import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@forge/api-client";
import { renderWithShell } from "@/test/test-utils";
import { TeamEarningsTab } from "./team-earnings-tab";
import type { TeamEarningEntry, TeamEarningsSummary, TeamPayoutRequest } from "../api/types";

vi.mock("../api/earnings-api", () => ({
  getOwnEarningsSummary: vi.fn(),
  listOwnEarningAllocations: vi.fn(),
  listOwnPayouts: vi.fn(),
  createOwnPayoutRequest: vi.fn(),
}));

vi.mock("@/features/onboarding/api/kyc-api", () => ({
  getOwnKycProfile: vi.fn(),
}));

import {
  createOwnPayoutRequest,
  getOwnEarningsSummary,
  listOwnEarningAllocations,
  listOwnPayouts,
} from "../api/earnings-api";
import { getOwnKycProfile } from "@/features/onboarding/api/kyc-api";
import type { KycProfile } from "@/features/onboarding/api/types";

const mockGetSummary = vi.mocked(getOwnEarningsSummary);
const mockListAllocations = vi.mocked(listOwnEarningAllocations);
const mockListPayouts = vi.mocked(listOwnPayouts);
const mockCreatePayout = vi.mocked(createOwnPayoutRequest);
const mockGetKyc = vi.mocked(getOwnKycProfile);

function kycProfile(overrides: Partial<KycProfile> = {}): KycProfile {
  return {
    id: "kyc-1",
    status: "VERIFIED",
    legalName: "Atharva",
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
    submittedAt: "2026-01-01T00:00:00.000Z",
    verifiedAt: "2026-01-05T00:00:00.000Z",
    rejectedAt: null,
    rejectionReason: null,
    documents: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
    ...overrides,
  };
}

const zeroSummary: TeamEarningsSummary = {
  available: "0.00",
  pending: "0.00",
  lifetimeEarned: "0.00",
  lifetimePaid: "0.00",
};

const earnedSummary: TeamEarningsSummary = {
  available: "3000.00",
  pending: "500.00",
  lifetimeEarned: "3500.00",
  lifetimePaid: "0.00",
};

const earningEntry: TeamEarningEntry = {
  id: "line-1",
  projectId: "proj-1",
  projectName: "Website Revamp",
  amount: "3500.00",
  status: "APPROVED",
  date: "2026-06-01T00:00:00.000Z",
};

const payout: TeamPayoutRequest = {
  id: "payout-1",
  userId: "user-1",
  userName: "Atharva",
  userEmail: "atharva@forgebuilds.in",
  amount: "500.00",
  status: "REQUESTED",
  payoutMethod: "BANK_TRANSFER",
  destination: { method: "BANK_TRANSFER" },
  requestedAt: "2026-06-02T00:00:00.000Z",
  reviewedBy: null,
  reviewedAt: null,
  approvedBy: null,
  approvedAt: null,
  processingStartedAt: null,
  processor: null,
  paidAt: null,
  rejectedAt: null,
  rejectionReason: null,
  failureReason: null,
  externalReference: null,
  version: 1,
  createdAt: "2026-06-02T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetKyc.mockResolvedValue(kycProfile());
});

describe("TeamEarningsTab — loading", () => {
  it("shows a loading state before the summary resolves", () => {
    mockGetSummary.mockReturnValue(new Promise(() => {}));
    mockListAllocations.mockReturnValue(new Promise(() => {}));
    mockListPayouts.mockReturnValue(new Promise(() => {}));
    renderWithShell(<TeamEarningsTab />);
    expect(screen.getByLabelText(/loading earnings/i)).toBeInTheDocument();
  });
});

describe("TeamEarningsTab — empty state", () => {
  it("shows zeroed figures and empty history when nothing has been earned yet", async () => {
    mockGetSummary.mockResolvedValue(zeroSummary);
    mockListAllocations.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    mockListPayouts.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    renderWithShell(<TeamEarningsTab />);

    expect(await screen.findAllByText("₹0.00")).not.toHaveLength(0);
    expect(await screen.findByText(/no earnings yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no withdrawal requests yet/i)).toBeInTheDocument();
  });
});

describe("TeamEarningsTab — earnings values", () => {
  it("renders the four summary figures and recent earnings history exactly as the server returns them", async () => {
    mockGetSummary.mockResolvedValue(earnedSummary);
    mockListAllocations.mockResolvedValue({ items: [earningEntry], page: 1, pageSize: 10, total: 1 });
    mockListPayouts.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    renderWithShell(<TeamEarningsTab />);

    expect(await screen.findByText("₹3,000.00")).toBeInTheDocument();
    expect(screen.getByText("₹500.00")).toBeInTheDocument();
    // "₹3,500.00" appears twice by design here: the Lifetime earned stat and this one entry's amount.
    expect(screen.getAllByText("₹3,500.00")).toHaveLength(2);
    expect(screen.getByText("Website Revamp")).toBeInTheDocument();
    // recoveryOwed is never requested or rendered — Finance-only.
    expect(screen.queryByText(/recovery/i)).not.toBeInTheDocument();
  });

  it("shows the payout method for each withdrawal in the payout history", async () => {
    mockGetSummary.mockResolvedValue(earnedSummary);
    mockListAllocations.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    mockListPayouts.mockResolvedValue({ items: [payout], page: 1, pageSize: 10, total: 1 });
    renderWithShell(<TeamEarningsTab />);

    expect(await screen.findByText("BANK TRANSFER")).toBeInTheDocument();
    expect(screen.getByText("REQUESTED")).toBeInTheDocument();
  });
});

describe("TeamEarningsTab — withdrawal form", () => {
  it("requests a withdrawal for the amount entered, after confirmation", async () => {
    mockGetSummary.mockResolvedValue(earnedSummary);
    mockListAllocations.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    mockListPayouts.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    mockCreatePayout.mockResolvedValue(payout);
    const user = userEvent.setup();
    renderWithShell(<TeamEarningsTab />);

    await user.click(await screen.findByRole("button", { name: "Withdraw funds" }));
    await user.type(screen.getByLabelText(/amount/i), "500.00");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText(/request this withdrawal/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Request withdrawal" }));

    await waitFor(() => expect(mockCreatePayout).toHaveBeenCalledWith("500.00"));
  });

  it("rejects a malformed amount before ever calling the API", async () => {
    mockGetSummary.mockResolvedValue(earnedSummary);
    mockListAllocations.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    mockListPayouts.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    const user = userEvent.setup();
    renderWithShell(<TeamEarningsTab />);

    await user.click(await screen.findByRole("button", { name: "Withdraw funds" }));
    await user.type(screen.getByLabelText(/amount/i), "not-a-number");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText(/enter an amount like/i)).toBeInTheDocument();
    expect(mockCreatePayout).not.toHaveBeenCalled();
  });

  it("surfaces an over-balance rejection from the server without computing it client-side", async () => {
    mockGetSummary.mockResolvedValue(earnedSummary);
    mockListAllocations.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    mockListPayouts.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    mockCreatePayout.mockRejectedValue(
      new ApiClientError(422, {
        code: "PAYOUT_EXCEEDS_AVAILABLE_BALANCE",
        message: "This withdrawal amount exceeds your available balance.",
        requestId: "r",
      })
    );
    const user = userEvent.setup();
    renderWithShell(<TeamEarningsTab />);

    await user.click(await screen.findByRole("button", { name: "Withdraw funds" }));
    await user.type(screen.getByLabelText(/amount/i), "999999.00");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Request withdrawal" }));

    expect(await screen.findByText("Couldn’t request withdrawal")).toBeInTheDocument();
    expect(screen.getByText("This withdrawal amount exceeds your available balance.")).toBeInTheDocument();
  });
});

describe("TeamEarningsTab — financial verification gate (K5 onboarding redesign)", () => {
  it("shows a verification gate instead of the withdraw button when KYC isn't VERIFIED", async () => {
    mockGetKyc.mockResolvedValue(kycProfile({ status: "UNDER_REVIEW" }));
    mockGetSummary.mockResolvedValue(earnedSummary);
    mockListAllocations.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    mockListPayouts.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    renderWithShell(<TeamEarningsTab />);

    expect(await screen.findByText("Financial verification required")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw funds" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /complete verification/i })).toBeInTheDocument();
  });

  it("shows the withdraw button (no gate) once KYC is VERIFIED", async () => {
    mockGetKyc.mockResolvedValue(kycProfile({ status: "VERIFIED" }));
    mockGetSummary.mockResolvedValue(earnedSummary);
    mockListAllocations.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    mockListPayouts.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    renderWithShell(<TeamEarningsTab />);

    expect(await screen.findByRole("button", { name: "Withdraw funds" })).toBeInTheDocument();
    expect(screen.queryByText("Financial verification required")).not.toBeInTheDocument();
  });
});

describe("TeamEarningsTab — error state", () => {
  it("shows session-expired copy on 401 rather than fabricating figures", async () => {
    mockGetSummary.mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHENTICATED", message: "no", requestId: "r" })
    );
    renderWithShell(<TeamEarningsTab />);
    expect(await screen.findByText("Session expired")).toBeInTheDocument();
    expect(screen.queryByText("₹0.00")).not.toBeInTheDocument();
  });
});

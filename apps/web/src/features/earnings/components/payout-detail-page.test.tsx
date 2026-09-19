import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { PayoutDetailPage } from "./payout-detail-page";
import type { TeamPayoutRequestFinanceView } from "../api/types";

vi.mock("../api/earnings-api", () => ({
  getPayout: vi.fn(),
  reviewPayout: vi.fn(),
  approvePayout: vi.fn(),
  rejectPayout: vi.fn(),
  processPayout: vi.fn(),
  markPayoutPaid: vi.fn(),
  markPayoutFailed: vi.fn(),
}));

import {
  approvePayout,
  getPayout,
  markPayoutFailed,
  markPayoutPaid,
  processPayout,
  rejectPayout,
  reviewPayout,
} from "../api/earnings-api";

const mockGet = vi.mocked(getPayout);
const mockReview = vi.mocked(reviewPayout);
const mockApprove = vi.mocked(approvePayout);
const mockReject = vi.mocked(rejectPayout);
const mockProcess = vi.mocked(processPayout);
const mockMarkPaid = vi.mocked(markPayoutPaid);
const mockMarkFailed = vi.mocked(markPayoutFailed);

const financeManage = createAuthContext({ role: "FINANCE", permissions: ["finance.manage"] });
const financeReadOnly = createAuthContext({ role: "FINANCE", permissions: ["finance.read"] });

function payout(overrides: Partial<TeamPayoutRequestFinanceView> = {}): TeamPayoutRequestFinanceView {
  return {
    id: "payout-1",
    userId: "user-1",
    userName: "Priya Sharma",
    userEmail: "priya@forgebuilds.in",
    amount: "1500.00",
    status: "REQUESTED",
    payoutMethod: "BANK_TRANSFER",
    destination: {
      method: "BANK_TRANSFER",
      accountHolderName: "Priya Sharma",
      bankName: "HDFC BANK",
      accountNumber: "1234567890123",
      ifsc: "HDFC0001234",
      upiId: "priya@okhdfcbank",
    },
    requestedAt: "2026-06-01T00:00:00.000Z",
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
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    memberBalance: {
      lifetimeEarned: "1500.00",
      pending: "0.00",
      lifetimePaid: "0.00",
      available: "1500.00",
      recoveryOwed: "0.00",
    },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("PayoutDetailPage — RBAC", () => {
  it("is forbidden for a role without finance.manage (GET /payouts/:id requires finance.manage, not finance.read)", async () => {
    renderWithShell(<PayoutDetailPage id="payout-1" />, financeReadOnly);
    expect(await screen.findByText(/don.t have access to it/i)).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("is forbidden for TEAM_MEMBER — this is how a member is kept from ever seeing Recovery Owed", async () => {
    const teamMember = createAuthContext({ role: "TEAM_MEMBER", permissions: [] });
    mockGet.mockResolvedValue(payout({ memberBalance: { lifetimeEarned: "1500.00", pending: "0.00", lifetimePaid: "0.00", available: "1500.00", recoveryOwed: "500.00" } }));
    renderWithShell(<PayoutDetailPage id="payout-1" />, teamMember);
    expect(await screen.findByText(/don.t have access to it/i)).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.queryByText(/recovery owed/i)).not.toBeInTheDocument();
  });
});

describe("PayoutDetailPage — member balance (RecoveryOwed)", () => {
  it("shows Finance the full balance breakdown, including a nonzero Recovery Owed, clearly labeled and distinct from Available", async () => {
    mockGet.mockResolvedValue(
      payout({
        memberBalance: {
          lifetimeEarned: "3000.00",
          pending: "0.00",
          lifetimePaid: "5000.00",
          available: "0.00",
          recoveryOwed: "2000.00",
        },
      })
    );
    renderWithShell(<PayoutDetailPage id="payout-1" />, financeManage);

    expect(await screen.findByText("Recovery owed")).toBeInTheDocument();
    expect(screen.getByText("₹2,000.00")).toBeInTheDocument();
    expect(screen.getByText("Lifetime earned")).toBeInTheDocument();
    expect(screen.getByText("₹3,000.00")).toBeInTheDocument();
    expect(screen.getByText("Lifetime paid")).toBeInTheDocument();
    expect(screen.getByText("₹5,000.00")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    // "Available" and "Pending" both legitimately render "₹0.00" here — assert presence, not uniqueness.
    expect(screen.getAllByText("₹0.00").length).toBeGreaterThanOrEqual(2);
  });

  it("shows a zeroed Recovery Owed when there is nothing to recover", async () => {
    mockGet.mockResolvedValue(payout());
    renderWithShell(<PayoutDetailPage id="payout-1" />, financeManage);
    await screen.findByText("Recovery owed");
    const recoveryRow = screen.getByText("Recovery owed").closest("div");
    expect(recoveryRow).toHaveTextContent("₹0.00");
  });
});

describe("PayoutDetailPage — masking", () => {
  it("masks the account number, IFSC, and UPI ID by default, and reveals on demand", async () => {
    mockGet.mockResolvedValue(payout());
    const user = userEvent.setup();
    renderWithShell(<PayoutDetailPage id="payout-1" />, financeManage);

    await screen.findByText("HDFC BANK");
    expect(screen.queryByText("1234567890123")).not.toBeInTheDocument();
    expect(screen.getByText("••••••0123")).toBeInTheDocument();
    expect(screen.queryByText("HDFC0001234")).not.toBeInTheDocument();
    expect(screen.getByText("HDFC••••••34")).toBeInTheDocument();
    expect(screen.queryByText("priya@okhdfcbank")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reveal account number/i }));
    expect(screen.getByText("1234567890123")).toBeInTheDocument();
  });

  it("never writes the raw destination fields into an audit-adjacent DOM node by accident — masked text only, until revealed", async () => {
    mockGet.mockResolvedValue(payout());
    renderWithShell(<PayoutDetailPage id="payout-1" />, financeManage);
    await screen.findByText("HDFC BANK");
    expect(document.body.textContent).not.toContain("1234567890123");
    expect(document.body.textContent).not.toContain("HDFC0001234");
  });
});

describe("PayoutDetailPage — review pipeline", () => {
  it("starts review from REQUESTED", async () => {
    mockGet.mockResolvedValue(payout());
    mockReview.mockResolvedValue(payout({ status: "UNDER_REVIEW", version: 2 }));
    const user = userEvent.setup();
    renderWithShell(<PayoutDetailPage id="payout-1" />, financeManage);

    await user.click(await screen.findByRole("button", { name: "Start review" }));
    await waitFor(() => expect(mockReview).toHaveBeenCalledWith("payout-1", 1));
  });

  it("approves from UNDER_REVIEW after confirmation", async () => {
    mockGet.mockResolvedValue(payout({ status: "UNDER_REVIEW", version: 2 }));
    mockApprove.mockResolvedValue(payout({ status: "APPROVED", version: 3 }));
    const user = userEvent.setup();
    renderWithShell(<PayoutDetailPage id="payout-1" />, financeManage);

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith("payout-1", 2));
  });

  it("requires a reason of at least 3 characters to reject", async () => {
    mockGet.mockResolvedValue(payout());
    const user = userEvent.setup();
    renderWithShell(<PayoutDetailPage id="payout-1" />, financeManage);

    await user.click(await screen.findByRole("button", { name: "Reject" }));
    await user.type(screen.getByLabelText(/rejection reason/i), "no");
    await user.click(screen.getByRole("button", { name: "Confirm rejection" }));

    expect(await screen.findByText(/enter a clear rejection reason/i)).toBeInTheDocument();
    expect(mockReject).not.toHaveBeenCalled();
  });

  it("rejects with the entered reason", async () => {
    mockGet.mockResolvedValue(payout());
    mockReject.mockResolvedValue(payout({ status: "REJECTED", version: 2, rejectionReason: "policy violation" }));
    const user = userEvent.setup();
    renderWithShell(<PayoutDetailPage id="payout-1" />, financeManage);

    await user.click(await screen.findByRole("button", { name: "Reject" }));
    await user.type(screen.getByLabelText(/rejection reason/i), "policy violation");
    await user.click(screen.getByRole("button", { name: "Confirm rejection" }));

    await waitFor(() => expect(mockReject).toHaveBeenCalledWith("payout-1", 1, "policy violation"));
  });

  it("starts processing from APPROVED", async () => {
    mockGet.mockResolvedValue(payout({ status: "APPROVED", version: 3 }));
    mockProcess.mockResolvedValue(payout({ status: "PROCESSING", version: 4 }));
    const user = userEvent.setup();
    renderWithShell(<PayoutDetailPage id="payout-1" />, financeManage);

    await user.click(await screen.findByRole("button", { name: "Start processing" }));
    await user.click(await screen.findByRole("button", { name: "Start processing" }));
    await waitFor(() => expect(mockProcess).toHaveBeenCalledWith("payout-1", 3));
  });

  it("offers a retry label (not 'start processing') when retrying from FAILED", async () => {
    mockGet.mockResolvedValue(payout({ status: "FAILED", version: 5, failureReason: "bank rejected" }));
    renderWithShell(<PayoutDetailPage id="payout-1" />, financeManage);
    expect(await screen.findByRole("button", { name: "Retry processing" })).toBeInTheDocument();
    expect(screen.getByText("bank rejected")).toBeInTheDocument();
  });

  it("marks paid with a required external reference", async () => {
    mockGet.mockResolvedValue(payout({ status: "PROCESSING", version: 4 }));
    mockMarkPaid.mockResolvedValue(payout({ status: "PAID", version: 5, externalReference: "UTR123" }));
    const user = userEvent.setup();
    renderWithShell(<PayoutDetailPage id="payout-1" />, financeManage);

    await user.click(await screen.findByRole("button", { name: "Mark paid" }));
    await user.click(screen.getByRole("button", { name: "Confirm paid" }));
    expect(await screen.findByText(/enter the transfer/i)).toBeInTheDocument();
    expect(mockMarkPaid).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/external reference/i), "UTR123");
    await user.click(screen.getByRole("button", { name: "Confirm paid" }));
    await waitFor(() => expect(mockMarkPaid).toHaveBeenCalledWith("payout-1", "UTR123"));
  });

  it("marks failed with a required reason", async () => {
    mockGet.mockResolvedValue(payout({ status: "PROCESSING", version: 4 }));
    mockMarkFailed.mockResolvedValue(payout({ status: "FAILED", version: 5, failureReason: "bank rejected transfer" }));
    const user = userEvent.setup();
    renderWithShell(<PayoutDetailPage id="payout-1" />, financeManage);

    await user.click(await screen.findByRole("button", { name: "Mark failed" }));
    await user.type(screen.getByLabelText(/failure reason/i), "bank rejected transfer");
    await user.click(screen.getByRole("button", { name: "Confirm failure" }));

    await waitFor(() => expect(mockMarkFailed).toHaveBeenCalledWith("payout-1", 4, "bank rejected transfer"));
  });

  it("shows no actions once terminal (PAID)", async () => {
    mockGet.mockResolvedValue(payout({ status: "PAID", version: 6, paidAt: "2026-06-05T00:00:00.000Z" }));
    renderWithShell(<PayoutDetailPage id="payout-1" />, financeManage);
    await screen.findByText(/no further action possible/i);
    expect(screen.queryByRole("button", { name: /mark paid/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reject/i })).not.toBeInTheDocument();
  });
});

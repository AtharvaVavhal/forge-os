import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@forge/api-client";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { KycReviewListPage } from "./kyc-review-pages";
import { KycReviewDetailPage } from "./kyc-review-detail-page";
import type { FinanceKycDetail, FinanceKycListItem } from "../api/kyc-types";

vi.mock("../api/kyc-api", () => ({
  listFinanceKyc: vi.fn(),
  getFinanceKyc: vi.fn(),
  reviewFinanceKyc: vi.fn(),
  getFinanceKycDocumentDownloadUrl: vi.fn(),
}));

import {
  getFinanceKyc,
  listFinanceKyc,
  reviewFinanceKyc,
} from "../api/kyc-api";

const mockList = vi.mocked(listFinanceKyc);
const mockGet = vi.mocked(getFinanceKyc);
const mockReview = vi.mocked(reviewFinanceKyc);

const listItem: FinanceKycListItem = {
  id: "kyc-1",
  status: "UNDER_REVIEW",
  memberName: "Priya Sharma",
  memberEmail: "priya@forge.local",
  submittedAt: "2026-09-18T10:00:00.000Z",
  verifiedAt: null,
  rejectedAt: null,
  createdAt: "2026-09-18T09:00:00.000Z",
  updatedAt: "2026-09-18T10:00:00.000Z",
};

const detail: FinanceKycDetail = {
  id: "kyc-1",
  status: "UNDER_REVIEW",
  member: { id: "u-1", name: "Priya Sharma", email: "priya@forge.local" },
  legalName: "Priya Sharma",
  dateOfBirth: "1995-04-12",
  mobile: "+919876543210",
  addressLine1: "12 Forge Lane",
  addressLine2: null,
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  pan: "ABCDE1234F",
  governmentIdType: "AADHAAR",
  governmentIdNumber: "123456789012",
  submittedAt: "2026-09-18T10:00:00.000Z",
  verifiedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  documents: [
    {
      id: "d1",
      documentType: "PAN_CARD",
      filename: "pan.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      status: "UPLOADED",
      createdAt: null,
      updatedAt: null,
    },
  ],
  payout: {
    configured: true,
    preferredMethod: "BANK_TRANSFER",
    accountHolderName: "Priya Sharma",
    bankName: "HDFC",
    accountNumber: "123456789012",
    ifsc: "HDFC0001234",
    upiId: "priya@okhdfcbank",
    upiQrUploaded: true,
  },
  createdAt: "2026-09-18T09:00:00.000Z",
  updatedAt: "2026-09-18T10:00:00.000Z",
};

const financeAuth = createAuthContext({
  role: "FINANCE",
  permissions: ["finance.read", "finance.manage"],
});

const teamAuth = createAuthContext({
  role: "TEAM_MEMBER",
  permissions: ["crm.read", "projects.read"],
});

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue({ items: [listItem], page: 1, pageSize: 25, total: 1 });
  mockGet.mockResolvedValue(detail);
  mockReview.mockResolvedValue({ ...detail, status: "VERIFIED", verifiedAt: "2026-09-18T12:00:00.000Z" });
});

describe("KycReviewListPage", () => {
  it("renders finance review list with UNDER_REVIEW rows", async () => {
    renderWithShell(<KycReviewListPage />, financeAuth);
    expect(await screen.findByRole("heading", { name: /kyc review/i })).toBeInTheDocument();
    expect(await screen.findByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("UNDER REVIEW")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /review/i })).toHaveAttribute(
      "href",
      "/finance/kyc/kyc-1"
    );
  });

  it("TEAM_MEMBER cannot access review UI", async () => {
    renderWithShell(<KycReviewListPage />, teamAuth);
    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("handles unauthorized list errors", async () => {
    mockList.mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "expired", requestId: "r" })
    );
    renderWithShell(<KycReviewListPage />, financeAuth);
    expect(
      await screen.findByText("Your session expired. Sign in again.")
    ).toBeInTheDocument();
  });

  it("shows empty state when queue is clear", async () => {
    mockList.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    renderWithShell(<KycReviewListPage />, financeAuth);
    expect(await screen.findByText(/nothing waiting for review/i)).toBeInTheDocument();
  });
});

describe("KycReviewDetailPage", () => {
  it("renders detail with masked sensitive values", async () => {
    renderWithShell(<KycReviewDetailPage id="kyc-1" />, financeAuth);
    expect(await screen.findByRole("heading", { name: /kyc review/i })).toBeInTheDocument();
    expect(screen.getByText("XXXXX1234F")).toBeInTheDocument();
    expect(screen.getByText("••••••9012")).toBeInTheDocument();
    expect(screen.queryByText("ABCDE1234F")).not.toBeInTheDocument();
  });

  it("approve action works", async () => {
    const user = userEvent.setup();
    renderWithShell(<KycReviewDetailPage id="kyc-1" />, financeAuth);
    await screen.findByRole("button", { name: /approve kyc/i });
    await user.click(screen.getByRole("button", { name: /approve kyc/i }));
    await user.click(screen.getByRole("button", { name: /confirm approval/i }));
    await waitFor(() => expect(mockReview).toHaveBeenCalledWith("kyc-1", { action: "APPROVE" }));
  });

  it("reject requires reason", async () => {
    const user = userEvent.setup();
    renderWithShell(<KycReviewDetailPage id="kyc-1" />, financeAuth);
    await user.click(await screen.findByRole("button", { name: /reject kyc/i }));
    await user.click(screen.getByRole("button", { name: /confirm rejection/i }));
    expect(mockReview).not.toHaveBeenCalled();
    expect(screen.getByText(/enter a clear rejection reason/i)).toBeInTheDocument();
  });

  it("reject action works with reason", async () => {
    const user = userEvent.setup();
    mockReview.mockResolvedValue({
      ...detail,
      status: "REJECTED",
      rejectionReason: "Blurry ID",
      rejectedAt: "2026-09-18T12:00:00.000Z",
    });
    renderWithShell(<KycReviewDetailPage id="kyc-1" />, financeAuth);
    await user.click(await screen.findByRole("button", { name: /reject kyc/i }));
    await user.type(screen.getByLabelText(/rejection reason/i), "Blurry ID scan");
    await user.click(screen.getByRole("button", { name: /confirm rejection/i }));
    await waitFor(() =>
      expect(mockReview).toHaveBeenCalledWith("kyc-1", {
        action: "REJECT",
        rejectionReason: "Blurry ID scan",
      })
    );
  });

  it("does not store sensitive KYC data in browser storage", async () => {
    renderWithShell(<KycReviewDetailPage id="kyc-1" />, financeAuth);
    await screen.findByText("XXXXX1234F");
    const dump = `${JSON.stringify(window.localStorage)} ${JSON.stringify(window.sessionStorage)}`;
    expect(dump).not.toContain("ABCDE1234F");
    expect(dump).not.toContain("123456789012");
  });

  it("TEAM_MEMBER cannot open detail UI", async () => {
    renderWithShell(<KycReviewDetailPage id="kyc-1" />, teamAuth);
    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

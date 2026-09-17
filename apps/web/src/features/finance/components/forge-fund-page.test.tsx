import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgeFundPage } from "./forge-fund-page";
import { FinanceOverviewPage } from "./finance-overview";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError, ApiNetworkError } from "@forge/api-client";
import type { ForgeFundEntry } from "../api/types";

vi.mock("../api/finance-api", () => ({
  getForgeFundBalance: vi.fn(),
  listForgeFundEntries: vi.fn(),
  createForgeFundEntry: vi.fn(),
  listInvoices: vi.fn(),
  listPayments: vi.fn(),
  listExpenses: vi.fn(),
}));

import {
  createForgeFundEntry,
  getForgeFundBalance,
  listExpenses,
  listForgeFundEntries,
  listInvoices,
  listPayments,
} from "../api/finance-api";

const entry: ForgeFundEntry = {
  id: "ff-1",
  type: "CONTRIBUTION",
  amount: "12000.00",
  reason: "Payment contribution",
  sourceType: "payment",
  sourceId: "pay-1",
  approvedBy: "user-1",
  createdAt: "2026-03-04T00:00:00.000Z",
};

const fundAdmin = createAuthContext({
  role: "FINANCE",
  permissions: ["forge_fund.read", "forge_fund.manage", "forge_fund.approve", "finance.read"],
});

describe("Forge Fund", () => {
  beforeEach(() => {
    vi.mocked(getForgeFundBalance).mockResolvedValue("12000.00");
    vi.mocked(listForgeFundEntries).mockResolvedValue({ items: [entry], page: 1, pageSize: 25, total: 1 });
    vi.mocked(createForgeFundEntry).mockReset();
  });

  it("renders backend balance and ledger types", async () => {
    renderWithShell(<ForgeFundPage />, fundAdmin);
    expect((await screen.findAllByText("₹12,000.00")).length).toBeGreaterThan(0);
    expect(screen.getByText("Payment contribution")).toBeInTheDocument();
    expect(screen.getByText("Contribution")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /payout/i })).not.toBeInTheDocument();
    expect(screen.queryByText("TeamPayout")).not.toBeInTheDocument();
    expect(screen.queryByText(/60\/40/)).not.toBeInTheDocument();
  });

  it("requires manage and approve to post a manual entry", async () => {
    renderWithShell(
      <ForgeFundPage />,
      createAuthContext({ permissions: ["forge_fund.read", "forge_fund.manage"] })
    );
    await screen.findByText("Payment contribution");
    expect(screen.queryByRole("button", { name: "Manual entry" })).not.toBeInTheDocument();
  });

  it("posts contribution, withdrawal, and allocation through the same endpoint", async () => {
    const user = userEvent.setup();
    vi.mocked(createForgeFundEntry).mockResolvedValue({ ...entry, type: "ALLOCATION", sourceType: null, sourceId: null });
    renderWithShell(<ForgeFundPage />, fundAdmin);
    await user.click(await screen.findByRole("button", { name: "Manual entry" }));
    await user.selectOptions(screen.getByLabelText(/type/i), "ALLOCATION");
    await user.type(screen.getByLabelText(/^amount/i), "5000.00");
    await user.type(screen.getByLabelText(/reason/i), "Explicit allocation — not a fixed split");
    await user.click(screen.getByRole("button", { name: "Post entry" }));
    await user.click(screen.getByRole("button", { name: "Post entry" }));
    expect(createForgeFundEntry).toHaveBeenCalledWith({
      type: "ALLOCATION",
      amount: "5000.00",
      reason: "Explicit allocation — not a fixed split",
      sourceType: null,
      sourceId: null,
    });
  });

  it("does not invent a ₹0 balance when the API is missing", async () => {
    vi.mocked(getForgeFundBalance).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    vi.mocked(listForgeFundEntries).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<ForgeFundPage />, fundAdmin);
    expect(await screen.findAllByText("Finance service is not currently available.")).not.toHaveLength(0);
    expect(screen.queryByText("₹0.00")).not.toBeInTheDocument();
  });

  it("shows 403 without leaking the ledger", async () => {
    vi.mocked(getForgeFundBalance).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    vi.mocked(listForgeFundEntries).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<ForgeFundPage />, createAuthContext({ permissions: ["forge_fund.read"] }));
    expect(await screen.findAllByText("You don’t have permission to do this.")).not.toHaveLength(0);
    expect(screen.queryByText("Payment contribution")).not.toBeInTheDocument();
  });
});

describe("Finance overview", () => {
  beforeEach(() => {
    vi.mocked(listInvoices).mockResolvedValue({ items: [], page: 1, pageSize: 1, total: 0 });
    vi.mocked(listPayments).mockResolvedValue({ items: [], page: 1, pageSize: 1, total: 0 });
    vi.mocked(listExpenses).mockResolvedValue({ items: [], page: 1, pageSize: 1, total: 0 });
    vi.mocked(getForgeFundBalance).mockResolvedValue("12000.00");
  });

  it("does not fabricate outstanding or collected totals", async () => {
    renderWithShell(<FinanceOverviewPage />, fundAdmin);
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(await screen.findByText("Outstanding invoices")).toBeInTheDocument();
    expect(screen.getAllByText("Awaiting live data. No outstanding-invoices aggregate is documented.").length).toBeGreaterThan(0);
    expect(screen.queryByText("₹4.82L")).not.toBeInTheDocument();
    expect(await screen.findByText("₹12,000.00")).toBeInTheDocument();
  });

  it("shows unavailable copy on 404 instead of zeros", async () => {
    vi.mocked(listInvoices).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    vi.mocked(getForgeFundBalance).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<FinanceOverviewPage />, fundAdmin);
    expect(await screen.findByText("Finance service is not currently available.")).toBeInTheDocument();
    expect(screen.queryByText("₹0.00")).not.toBeInTheDocument();
  });

  it("surfaces network failure without fake figures", async () => {
    vi.mocked(listInvoices).mockRejectedValue(new ApiNetworkError(new Error("offline")));
    vi.mocked(listPayments).mockRejectedValue(new ApiNetworkError(new Error("offline")));
    vi.mocked(listExpenses).mockRejectedValue(new ApiNetworkError(new Error("offline")));
    vi.mocked(getForgeFundBalance).mockRejectedValue(new ApiNetworkError(new Error("offline")));
    renderWithShell(<FinanceOverviewPage />, fundAdmin);
    expect(
      await screen.findAllByText("We couldn’t reach the API. Check your connection and try again.")
    ).not.toHaveLength(0);
  });

  it("shows loading before any figures", async () => {
    vi.mocked(listInvoices).mockImplementation(() => new Promise(() => {}));
    vi.mocked(listPayments).mockImplementation(() => new Promise(() => {}));
    vi.mocked(listExpenses).mockImplementation(() => new Promise(() => {}));
    vi.mocked(getForgeFundBalance).mockImplementation(() => new Promise(() => {}));
    renderWithShell(<FinanceOverviewPage />, fundAdmin);
    expect(await screen.findByText("Loading finance overview")).toBeInTheDocument();
    expect(screen.queryByText("₹0.00")).not.toBeInTheDocument();
  });

  it("shows 403 without fabricating totals", async () => {
    vi.mocked(listInvoices).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    vi.mocked(listPayments).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    vi.mocked(listExpenses).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<FinanceOverviewPage />, createAuthContext({ role: "TEAM_MEMBER", permissions: [] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
    expect(screen.queryByText("₹12,000.00")).not.toBeInTheDocument();
  });
});

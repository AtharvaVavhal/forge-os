import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceDetailPage, InvoicesPage } from "./invoices-pages";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError, ApiNetworkError } from "@forge/api-client";
import type { Invoice } from "../api/types";

vi.mock("../api/finance-api", () => ({
  listInvoices: vi.fn(),
  getInvoice: vi.fn(),
  createInvoice: vi.fn(),
  createInvoiceFromProposal: vi.fn(),
  updateInvoice: vi.fn(),
  replaceInvoiceLineItems: vi.fn(),
  sendInvoice: vi.fn(),
  voidInvoice: vi.fn(),
  cancelInvoice: vi.fn(),
  remindInvoice: vi.fn(),
  createCreditNote: vi.fn(),
}));

vi.mock("@/features/crm/api/crm-api", () => ({
  listCompanies: vi.fn(),
}));

vi.mock("@/features/sales/api/sales-api", () => ({
  listProposals: vi.fn(),
}));

import {
  createCreditNote,
  createInvoice,
  getInvoice,
  listInvoices,
  sendInvoice,
  updateInvoice,
} from "../api/finance-api";
import { listCompanies } from "@/features/crm/api/crm-api";

const draft: Invoice = {
  id: "inv-1",
  organizationId: "org-1",
  invoiceNumber: null,
  financialYear: "2026-27",
  projectId: null,
  companyId: "c1",
  company: { id: "c1", name: "Acme" },
  status: "DRAFT",
  taxTreatment: "IGST",
  billTo: { name: "Acme", gstin: "27AAAAA0000A1Z5", billingState: "MH", billingAddress: null },
  amount: "11800.00",
  paidAmount: "0.00",
  pendingAmount: "11800.00",
  dueDate: "2026-04-01T00:00:00.000Z",
  sentAt: null,
  cancelledAt: null,
  cancellationReason: null,
  version: 1,
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: null,
  lineItems: [
    {
      id: "li-1",
      description: "Build",
      hsnSacCode: "998314",
      quantity: "1.00",
      unitPrice: "10000.00",
      cgstRate: null,
      sgstRate: null,
      igstRate: "18.00",
      lineTotal: "11800.00",
      sortOrder: 0,
    },
  ],
  payments: [],
  creditNotes: [],
};

const manage = createAuthContext({
  role: "FINANCE",
  permissions: ["finance.read", "finance.manage"],
});

describe("Invoices list", () => {
  beforeEach(() => {
    vi.mocked(listCompanies).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(listInvoices).mockResolvedValue({ items: [draft], page: 1, pageSize: 25, total: 1 });
  });

  it("renders number, client, status, and backend amounts", async () => {
    renderWithShell(<InvoicesPage />, manage);
    expect(await screen.findByRole("link", { name: "Draft" })).toHaveAttribute("href", "/finance/invoices/inv-1");
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getAllByText("₹11,800.00").length).toBeGreaterThan(0);
  });

  it("hides create without finance.manage", async () => {
    renderWithShell(<InvoicesPage />, createAuthContext({ permissions: ["finance.read"] }));
    await screen.findByRole("link", { name: "Draft" });
    expect(screen.queryByRole("button", { name: "New draft" })).not.toBeInTheDocument();
  });

  it("validates company on create", async () => {
    const user = userEvent.setup();
    renderWithShell(<InvoicesPage />, manage);
    await user.click(await screen.findByRole("button", { name: "New draft" }));
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    expect(await screen.findByText("Select a company.")).toBeInTheDocument();
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("shows empty copy that is not a rupee total", async () => {
    vi.mocked(listInvoices).mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    renderWithShell(<InvoicesPage />, manage);
    expect(await screen.findByText("No invoices")).toBeInTheDocument();
    expect(screen.queryByText("₹0.00")).not.toBeInTheDocument();
  });

  it("shows 403 without leaking rows", async () => {
    vi.mocked(listInvoices).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<InvoicesPage />, createAuthContext({ permissions: ["finance.read"] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();
  });

  it("shows session expiry on 401", async () => {
    vi.mocked(listInvoices).mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "expired", requestId: "r" })
    );
    renderWithShell(<InvoicesPage />, manage);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your session expired. Sign in again.");
  });

  it("does not turn a 404 module into ₹0", async () => {
    vi.mocked(listInvoices).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<InvoicesPage />, manage);
    expect(await screen.findByText("Finance service is not currently available.")).toBeInTheDocument();
    expect(screen.queryByText("₹0")).not.toBeInTheDocument();
    expect(screen.queryByText("₹0.00")).not.toBeInTheDocument();
  });

  it("surfaces network failure", async () => {
    vi.mocked(listInvoices).mockRejectedValue(new ApiNetworkError(new Error("offline")));
    renderWithShell(<InvoicesPage />, manage);
    expect(await screen.findByText("We couldn’t reach the API. Check your connection and try again.")).toBeInTheDocument();
  });
});

describe("Invoice detail", () => {
  beforeEach(() => {
    vi.mocked(getInvoice).mockResolvedValue(draft);
    vi.mocked(sendInvoice).mockReset();
    vi.mocked(createCreditNote).mockReset();
    vi.mocked(updateInvoice).mockReset();
  });

  it("shows snapshot line totals and GST fields without multiplying", async () => {
    renderWithShell(<InvoiceDetailPage id="inv-1" />, manage);
    expect(await screen.findByRole("heading", { name: "Draft invoice" })).toBeInTheDocument();
    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText("998314")).toBeInTheDocument();
    expect(screen.getByText("18.00")).toBeInTheDocument();
    expect(screen.getByText("27AAAAA0000A1Z5")).toBeInTheDocument();
    expect(screen.getByText("2026-27")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change status/i })).not.toBeInTheDocument();
  });

  it("sends a draft through POST /invoices/:id/send", async () => {
    const user = userEvent.setup();
    vi.mocked(sendInvoice).mockResolvedValue({ ...draft, status: "SENT", invoiceNumber: "INV/0001" });
    renderWithShell(<InvoiceDetailPage id="inv-1" />, manage);
    await user.click(await screen.findByRole("button", { name: "Send" }));
    await user.click(screen.getByRole("button", { name: "Send invoice" }));
    expect(sendInvoice).toHaveBeenCalledWith("inv-1");
  });

  it("edits draft due date with optimistic version", async () => {
    const user = userEvent.setup();
    vi.mocked(updateInvoice).mockResolvedValue({ ...draft, dueDate: "2026-05-01" });
    renderWithShell(<InvoiceDetailPage id="inv-1" />, manage);
    await user.click(await screen.findByRole("button", { name: "Edit draft" }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(updateInvoice).toHaveBeenCalledWith("inv-1", expect.objectContaining({ version: 1 }));
  });

  it("surfaces 422 send failures", async () => {
    const user = userEvent.setup();
    vi.mocked(sendInvoice).mockRejectedValue(
      new ApiClientError(422, { code: "VALIDATION_ERROR", message: "Invoice has no line items.", requestId: "r" })
    );
    renderWithShell(<InvoiceDetailPage id="inv-1" />, manage);
    await user.click(await screen.findByRole("button", { name: "Send" }));
    await user.click(screen.getByRole("button", { name: "Send invoice" }));
    expect(await screen.findByText("Invoice has no line items.")).toBeInTheDocument();
  });

  it("issues a credit note with a documented reason", async () => {
    const user = userEvent.setup();
    vi.mocked(createCreditNote).mockResolvedValue({
      id: "cn-1",
      organizationId: "org-1",
      creditNoteNumber: "CN/0001",
      financialYear: "2026-27",
      invoiceId: "inv-1",
      invoice: null,
      reason: "PRICING_ERROR",
      amount: "500.00",
      issuedAt: null,
      approvedBy: "user-1",
      createdAt: null,
      lineItems: [],
    });
    renderWithShell(<InvoiceDetailPage id="inv-1" />, manage);
    await user.click(await screen.findByRole("tab", { name: "Credit notes" }));
    await user.click(screen.getByRole("button", { name: "Issue credit note" }));
    await user.type(screen.getByLabelText(/amount/i), "500.00");
    await user.click(screen.getByRole("button", { name: "Issue note" }));
    expect(createCreditNote).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: "inv-1", amount: "500.00", reason: "SCOPE_REDUCTION" })
    );
  });

  it("hides lifecycle actions without finance.manage", async () => {
    const user = userEvent.setup();
    renderWithShell(<InvoiceDetailPage id="inv-1" />, createAuthContext({ permissions: ["finance.read"] }));
    await screen.findByRole("heading", { name: "Draft invoice" });
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit draft" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Credit notes" }));
    expect(screen.queryByRole("button", { name: "Issue credit note" })).not.toBeInTheDocument();
  });

  it("does not offer send on paid invoices", async () => {
    vi.mocked(getInvoice).mockResolvedValue({ ...draft, status: "PAID", invoiceNumber: "INV/0001" });
    renderWithShell(<InvoiceDetailPage id="inv-1" />, manage);
    await screen.findByRole("heading", { name: "INV/0001" });
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Void" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit draft" })).not.toBeInTheDocument();
  });

  it("does not turn a 404 module into a ₹0 invoice", async () => {
    vi.mocked(getInvoice).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<InvoiceDetailPage id="inv-1" />, manage);
    expect(await screen.findByText("Finance service is not currently available.")).toBeInTheDocument();
    expect(screen.queryByText("₹0.00")).not.toBeInTheDocument();
  });

  it("shows 403 without leaking amounts", async () => {
    vi.mocked(getInvoice).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<InvoiceDetailPage id="inv-1" />, createAuthContext({ permissions: ["finance.read"] }));
    expect(await screen.findByText("This page doesn’t exist, or you don’t have access to it.")).toBeInTheDocument();
    expect(screen.queryByText("₹11,800.00")).not.toBeInTheDocument();
  });

  it("shows session expiry on 401", async () => {
    vi.mocked(getInvoice).mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "expired", requestId: "r" })
    );
    renderWithShell(<InvoiceDetailPage id="inv-1" />, manage);
    expect(await screen.findByText("Your session expired. Sign in again.")).toBeInTheDocument();
  });
});

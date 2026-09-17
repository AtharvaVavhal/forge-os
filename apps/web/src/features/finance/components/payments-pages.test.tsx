import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentDetailPage, PaymentsPage } from "./payments-pages";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError } from "@forge/api-client";
import type { Payment } from "../api/types";

vi.mock("../api/finance-api", () => ({
  listPayments: vi.fn(),
  getPayment: vi.fn(),
  createPayment: vi.fn(),
  createRefund: vi.fn(),
  listInvoices: vi.fn(),
}));

import { createRefund, createPayment, getPayment, listInvoices, listPayments } from "../api/finance-api";

const completed: Payment = {
  id: "pay-1",
  organizationId: "org-1",
  invoiceId: "inv-1",
  invoice: { id: "inv-1", name: "INV/0001" },
  amount: "2000.00",
  method: "BANK_TRANSFER",
  status: "COMPLETED",
  razorpayPaymentId: null,
  razorpayOrderId: null,
  referenceNote: "NEFT",
  recordedBy: "user-1",
  paidAt: "2026-03-04T00:00:00.000Z",
  version: 1,
  createdAt: null,
  refunds: [],
};

const manage = createAuthContext({
  role: "FINANCE",
  permissions: ["finance.read", "finance.manage"],
});

describe("Payments list", () => {
  beforeEach(() => {
    vi.mocked(listPayments).mockResolvedValue({ items: [completed], page: 1, pageSize: 25, total: 1 });
  });

  it("renders status, method, and amount", async () => {
    renderWithShell(<PaymentsPage />, manage);
    expect(await screen.findByRole("link", { name: "INV/0001" })).toHaveAttribute(
      "href",
      "/finance/payments/pay-1"
    );
    expect(screen.getByText("₹2,000.00")).toBeInTheDocument();
    expect(screen.getByText("Bank Transfer")).toBeInTheDocument();
  });

  it("hides record without finance.manage", async () => {
    renderWithShell(<PaymentsPage />, createAuthContext({ permissions: ["finance.read"] }));
    await screen.findByRole("link", { name: "INV/0001" });
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
  });

  it("does not turn a 404 module into collected ₹0", async () => {
    vi.mocked(listPayments).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<PaymentsPage />, manage);
    expect(await screen.findByText("Finance service is not currently available.")).toBeInTheDocument();
    expect(screen.queryByText("₹0.00")).not.toBeInTheDocument();
  });

  it("validates offline payment create", async () => {
    const user = userEvent.setup();
    vi.mocked(listInvoices).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    renderWithShell(<PaymentsPage />, manage);
    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    await user.click(screen.getByRole("button", { name: "Save payment" }));
    expect(await screen.findByText("Select an invoice.")).toBeInTheDocument();
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("shows 403 without leaking amounts", async () => {
    vi.mocked(listPayments).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<PaymentsPage />, createAuthContext({ permissions: ["finance.read"] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
    expect(screen.queryByText("₹2,000.00")).not.toBeInTheDocument();
  });
});

describe("Payment detail", () => {
  beforeEach(() => {
    vi.mocked(getPayment).mockResolvedValue(completed);
    vi.mocked(createRefund).mockReset();
  });

  it("shows failed and reversed as statuses, not editable dropdowns", async () => {
    vi.mocked(getPayment).mockResolvedValue({ ...completed, status: "FAILED" });
    renderWithShell(<PaymentDetailPage id="pay-1" />, manage);
    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refund" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /status/i })).not.toBeInTheDocument();
  });

  it("refunds a completed payment through confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(createRefund).mockResolvedValue({
      id: "rf-1",
      paymentId: "pay-1",
      amount: "500.00",
      reason: "Duplicate",
      status: "PENDING",
      razorpayRefundId: null,
      approvedBy: "user-1",
      createdAt: null,
    });
    renderWithShell(<PaymentDetailPage id="pay-1" />, manage);
    await user.click(await screen.findByRole("button", { name: "Refund" }));
    await user.type(screen.getByLabelText(/^amount/i), "500.00");
    await user.type(screen.getByLabelText(/reason/i), "Duplicate");
    await user.click(screen.getByRole("button", { name: "Request refund" }));
    await user.click(screen.getByRole("button", { name: "Submit refund" }));
    expect(createRefund).toHaveBeenCalledWith({ paymentId: "pay-1", amount: "500.00", reason: "Duplicate" });
  });

  it("renders reversed with nested refunds", async () => {
    vi.mocked(getPayment).mockResolvedValue({
      ...completed,
      status: "REVERSED",
      refunds: [
        {
          id: "rf-1",
          paymentId: "pay-1",
          amount: "2000.00",
          reason: "Chargeback",
          status: "COMPLETED",
          razorpayRefundId: null,
          approvedBy: "user-1",
          createdAt: null,
        },
      ],
    });
    renderWithShell(<PaymentDetailPage id="pay-1" />, manage);
    expect(await screen.findByText("Reversed")).toBeInTheDocument();
    expect(screen.getByText("Chargeback")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refund" })).not.toBeInTheDocument();
  });

  it("does not offer refund on pending payments", async () => {
    vi.mocked(getPayment).mockResolvedValue({ ...completed, status: "PENDING" });
    renderWithShell(<PaymentDetailPage id="pay-1" />, manage);
    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refund" })).not.toBeInTheDocument();
  });

  it("shows session expiry on 401", async () => {
    vi.mocked(getPayment).mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "expired", requestId: "r" })
    );
    renderWithShell(<PaymentDetailPage id="pay-1" />, manage);
    expect(await screen.findByText("Your session expired. Sign in again.")).toBeInTheDocument();
  });

  it("does not turn a 404 module into a completed ₹0 payment", async () => {
    vi.mocked(getPayment).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<PaymentDetailPage id="pay-1" />, manage);
    expect(await screen.findByText("Finance service is not currently available.")).toBeInTheDocument();
    expect(screen.queryByText("₹0.00")).not.toBeInTheDocument();
  });
});

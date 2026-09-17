import { describe, expect, it } from "vitest";
import {
  creditNoteFormSchema,
  expenseFormSchema,
  forgeFundEntrySchema,
  invoiceFormSchema,
  paymentFormSchema,
  refundFormSchema,
} from "./finance-forms";

describe("Finance form schemas", () => {
  it("requires a company on invoice create and does not accept an invoice number", () => {
    expect(invoiceFormSchema.safeParse({ companyId: "" }).success).toBe(false);
    expect(invoiceFormSchema.safeParse({ companyId: "c1" }).success).toBe(true);
    expect(invoiceFormSchema.safeParse({ companyId: "c1", invoiceNumber: "INV/1" }).success).toBe(true);
    expect(invoiceFormSchema.parse({ companyId: "c1", invoiceNumber: "INV/1" })).not.toHaveProperty("invoiceNumber");
  });

  it("rejects Razorpay on the offline payment form", () => {
    expect(
      paymentFormSchema.safeParse({ invoiceId: "inv-1", amount: "100.00", method: "RAZORPAY" }).success
    ).toBe(false);
    expect(
      paymentFormSchema.safeParse({ invoiceId: "inv-1", amount: "100.00", method: "BANK_TRANSFER" }).success
    ).toBe(true);
  });

  it("rejects float money and empty refund reasons", () => {
    expect(refundFormSchema.safeParse({ amount: 500, reason: "Duplicate" }).success).toBe(false);
    expect(refundFormSchema.safeParse({ amount: "500.00", reason: "" }).success).toBe(false);
    expect(refundFormSchema.safeParse({ amount: "500.00", reason: "Duplicate" }).success).toBe(true);
  });

  it("allows a zero credit note amount", () => {
    expect(
      creditNoteFormSchema.safeParse({ invoiceId: "inv-1", reason: "GOODWILL", amount: "0.00" }).success
    ).toBe(true);
  });

  it("requires expense description, amount, category, and date", () => {
    expect(expenseFormSchema.safeParse({ description: "", amount: "1.00", category: "ops", incurredAt: "2026-03-01" }).success).toBe(
      false
    );
    expect(
      expenseFormSchema.safeParse({
        description: "AWS",
        amount: "4200.00",
        category: "infrastructure",
        incurredAt: "2026-03-01",
      }).success
    ).toBe(true);
  });

  it("accepts the three Forge Fund entry types only", () => {
    expect(
      forgeFundEntrySchema.safeParse({ type: "PAYOUT", amount: "1.00", reason: "no" }).success
    ).toBe(false);
    expect(
      forgeFundEntrySchema.safeParse({ type: "ALLOCATION", amount: "5000.00", reason: "Explicit" }).success
    ).toBe(true);
  });
});

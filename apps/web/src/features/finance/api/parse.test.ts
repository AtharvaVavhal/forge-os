import { describe, expect, it } from "vitest";
import { parseCreditNote, parseExpense, parseForgeFundBalance, parseForgeFundEntry, parseInvoice, parseInvoiceLineItem, parsePayment } from "./parse";

describe("Finance parsing", () => {
  it("parses invoice money as strings and does not invent outstanding", () => {
    const invoice = parseInvoice({
      id: "inv-1",
      companyId: "c1",
      status: "SENT",
      invoice_number: "INV/0001",
      amount: "11800.00",
      paid_amount: "2000.00",
      tax_treatment: "IGST",
      line_items: [
        {
          id: "li1",
          description: "Site",
          quantity: "1.00",
          unit_price: "10000.00",
          igst_rate: "18.00",
          line_total: "11800.00",
          hsn_sac_code: "998314",
        },
      ],
    });
    expect(invoice?.amount).toBe("11800.00");
    expect(invoice?.paidAmount).toBe("2000.00");
    expect(invoice?.pendingAmount).toBeNull();
    expect(invoice?.lineItems[0]?.lineTotal).toBe("11800.00");
  });

  it("rejects numeric money on line items", () => {
    const line = parseInvoiceLineItem({
      id: "li1",
      description: "Site",
      quantity: 1,
      unitPrice: 10000,
      lineTotal: 11800,
    });
    expect(line?.quantity).toBeNull();
    expect(line?.unitPrice).toBeNull();
    expect(line?.lineTotal).toBeNull();
  });

  it("parses payment provider ids without secrets", () => {
    const payment = parsePayment({
      id: "pay-1",
      invoiceId: "inv-1",
      amount: "2000.00",
      method: "RAZORPAY",
      status: "COMPLETED",
      razorpay_payment_id: "pay_abc",
      razorpay_order_id: "order_abc",
    });
    expect(payment?.razorpayPaymentId).toBe("pay_abc");
    expect(payment).not.toHaveProperty("secret");
  });

  it("parses forge fund balance from {balance}", () => {
    expect(parseForgeFundBalance({ data: { balance: "12000.00" } })).toBe("12000.00");
    expect(parseForgeFundBalance({ data: { balance: 12000 } })).toBeNull();
  });

  it("keeps signed withdrawal amounts as strings", () => {
    const entry = parseForgeFundEntry({
      id: "ff-1",
      type: "WITHDRAWAL",
      amount: "-5000.00",
      reason: "Manual withdrawal",
    });
    expect(entry?.amount).toBe("-5000.00");
    expect(entry?.type).toBe("WITHDRAWAL");
  });

  it("parses credit notes and expenses without inventing status machines", () => {
    expect(
      parseCreditNote({
        id: "cn-1",
        invoiceId: "inv-1",
        reason: "GOODWILL",
        amount: "0.00",
        credit_note_number: "CN/0001",
      })?.creditNoteNumber
    ).toBe("CN/0001");
    expect(
      parseExpense({
        id: "ex-1",
        description: "AWS",
        category: "infrastructure",
        amount: "4200.00",
      })?.amount
    ).toBe("4200.00");
  });
});

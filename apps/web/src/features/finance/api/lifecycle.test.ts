import { describe, expect, it } from "vitest";
import {
  canCancelInvoice,
  canRefundPayment,
  canRemindInvoice,
  canSendInvoice,
  canVoidInvoice,
} from "./lifecycle";

describe("Finance lifecycle", () => {
  it("keeps send and void on drafts only", () => {
    expect(canSendInvoice("DRAFT")).toBe(true);
    expect(canVoidInvoice("DRAFT")).toBe(true);
    expect(canSendInvoice("SENT")).toBe(false);
    expect(canVoidInvoice("PAID")).toBe(false);
  });

  it("does not offer arbitrary invoice status changes", () => {
    expect(canCancelInvoice("SENT")).toBe(true);
    expect(canCancelInvoice("DRAFT")).toBe(false);
    expect(canRefundPayment("COMPLETED")).toBe(true);
    expect(canRefundPayment("PENDING")).toBe(false);
    expect(canRemindInvoice("OVERDUE")).toBe(true);
    expect(canRemindInvoice("DRAFT")).toBe(false);
  });
});

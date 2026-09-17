import { describe, expect, it } from "vitest";
import { parseProposal, parseProposalList } from "./parse";

describe("Proposal parsing", () => {
  it("parses version, status, and line items without inventing amount", () => {
    const proposal = parseProposal({
      id: "p1",
      dealId: "d1",
      version: 3,
      status: "DRAFT",
      line_items: [{ id: "li1", description: "Site", quantity: "2.00", unit_price: "15000.00" }],
    });
    expect(proposal?.version).toBe(3);
    expect(proposal?.lineItems[0]?.unitPrice).toBe("15000.00");
    expect(proposal?.lineItems[0]).not.toHaveProperty("amount");
  });

  it("rejects numeric money on line items", () => {
    const proposal = parseProposal({
      id: "p1",
      deal_id: "d1",
      version: 1,
      status: "DRAFT",
      lineItems: [{ id: "li1", description: "Site", quantity: 2, unitPrice: 15000 }],
    });
    expect(proposal?.lineItems[0]?.quantity).toBeNull();
    expect(proposal?.lineItems[0]?.unitPrice).toBeNull();
  });

  it("parses an offset list envelope", () => {
    const list = parseProposalList({
      data: [{ id: "p1", dealId: "d1", version: 1, status: "SENT" }],
      meta: { pagination: { mode: "offset", page: 1, pageSize: 25, total: 1 } },
    });
    expect(list?.items).toHaveLength(1);
  });
});

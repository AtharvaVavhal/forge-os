import { describe, expect, it } from "vitest";
import { hrefForSearchHit } from "./search-href";
import { parseAuditLogRecord, parseNotificationRecord, parseSearchHits } from "./parse";

describe("Search href mapping", () => {
  it("maps documented entity types to workspace routes", () => {
    expect(hrefForSearchHit({ id: "c1", entityType: "Company", title: "Acme" })).toBe("/crm/companies/c1");
    expect(hrefForSearchHit({ id: "d1", entityType: "deal", title: "Site" })).toBe("/crm/deals/d1");
    expect(hrefForSearchHit({ id: "i1", entityType: "invoice", title: "INV/1" })).toBe("/finance/invoices/i1");
    expect(hrefForSearchHit({ id: "t1", entityType: "Task", title: "Build" })).toBeNull();
  });
});

describe("Shared parsing", () => {
  it("parses notifications without inventing unread counts", () => {
    expect(
      parseNotificationRecord({
        id: "n1",
        type: "Task assigned",
        channel: "IN_APP",
        read_at: null,
      })?.readAt
    ).toBeNull();
  });

  it("parses audit logs as read-only records", () => {
    const entry = parseAuditLogRecord({
      id: "a1",
      action: "payment.create",
      entity_type: "Payment",
      entity_id: "pay-1",
      actor_type: "USER",
      actor_id: "user-1",
    });
    expect(entry?.action).toBe("payment.create");
    expect(entry?.entityType).toBe("Payment");
  });

  it("parses search hits from envelope or hits array", () => {
    expect(
      parseSearchHits({
        data: [{ id: "c1", entityType: "Company", title: "Acme" }],
        meta: { pagination: { mode: "offset", page: 1, pageSize: 25, total: 1 } },
      })
    ).toEqual([{ id: "c1", entityType: "Company", title: "Acme" }]);
    expect(parseSearchHits({ data: { hits: [{ id: "p1", type: "Project", name: "Site" }] } })).toEqual([
      { id: "p1", entityType: "Project", title: "Site" },
    ]);
  });
});

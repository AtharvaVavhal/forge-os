import { describe, expect, it } from "vitest";
import { parseCompany, parseCompanyList, parseDeal, parseLead, parseLeadConversion } from "./parse";

describe("CRM payload parsing", () => {
  it("parses a company from camelCase or snake_case without extra fields", () => {
    const company = parseCompany({
      id: "c1",
      name: "Acme",
      billing_state: "MH",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(company?.name).toBe("Acme");
    expect(company?.billingState).toBe("MH");
  });

  it("rejects money sent as a JSON number", () => {
    expect(
      parseDeal({
        id: "d1",
        title: "Site",
        stage: "NEW",
        ownerId: "u1",
        estimatedValue: 12000,
      })?.estimatedValue
    ).toBeNull();
  });

  it("parses an offset list envelope", () => {
    const list = parseCompanyList({
      data: [{ id: "c1", name: "Acme" }],
      meta: { pagination: { mode: "offset", page: 1, pageSize: 25, total: 1 } },
    });
    expect(list?.items).toHaveLength(1);
    expect(list?.total).toBe(1);
  });

  it("returns null for an unrecognized lead payload", () => {
    expect(parseLead({ id: "l1", name: "not a lead" })).toBeNull();
  });

  it("parses the documented lead conversion envelope", () => {
    const parsed = parseLeadConversion({
      data: {
        lead: {
          id: "l1",
          status: "CONVERTED",
          source: "REFERRAL",
          convertedToDealId: "d1",
        },
        deal: {
          id: "d1",
          title: "Acme site",
          stage: "NEW",
          ownerId: "u1",
          estimatedValue: "10000.00",
        },
      },
    });
    expect(parsed?.deal.id).toBe("d1");
    expect(parsed?.lead.status).toBe("CONVERTED");
  });
});

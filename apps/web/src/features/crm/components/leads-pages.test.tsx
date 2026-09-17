import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeadDetailPage, LeadsPage } from "./leads-pages";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError } from "@forge/api-client";
import { routerMocks } from "@/test/setup";
import type { Lead } from "../api/types";

vi.mock("../api/crm-api", () => ({
  getLead: vi.fn(),
  listLeads: vi.fn(),
  listCompanies: vi.fn(),
  listContacts: vi.fn(),
  updateLead: vi.fn(),
  createLead: vi.fn(),
  transitionLead: vi.fn(),
  convertLead: vi.fn(),
}));

import { convertLead, getLead, listCompanies, listContacts, listLeads, transitionLead } from "../api/crm-api";

const qualified: Lead = {
  id: "lead-1",
  organizationId: "org-1",
  contactId: null,
  companyId: null,
  contact: null,
  company: { id: "c1", name: "Acme" },
  status: "QUALIFIED",
  source: "REFERRAL",
  notes: null,
  convertedToDealId: null,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: null,
};

const deal = {
  id: "deal-1",
  organizationId: "org-1",
  title: "Acme site",
  companyId: null,
  contactId: null,
  company: null,
  contact: null,
  stage: "NEW" as const,
  estimatedValue: "10000.00",
  ownerId: "user-1",
  lostReason: null,
  nextFollowUpAt: null,
  reopenedFromDealId: null,
  archivedAt: null,
  createdAt: null,
  updatedAt: null,
};

describe("Leads list", () => {
  beforeEach(() => {
    vi.mocked(listCompanies).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(listContacts).mockResolvedValue({ items: [], limit: 100, nextCursor: null });
    vi.mocked(listLeads).mockResolvedValue({ items: [qualified], page: 1, pageSize: 25, total: 1 });
  });

  it("renders documented lead fields from the list API", async () => {
    renderWithShell(
      <LeadsPage />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] })
    );
    expect(await screen.findByRole("link", { name: "Acme" })).toHaveAttribute("href", "/crm/leads/lead-1");
    expect(screen.getAllByText("Qualified").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Referral").length).toBeGreaterThan(0);
  });

  it("hides create without crm.manage", async () => {
    renderWithShell(<LeadsPage />, createAuthContext({ permissions: ["crm.read"] }));
    await screen.findByRole("link", { name: "Acme" });
    expect(screen.queryByRole("button", { name: "New lead" })).not.toBeInTheDocument();
  });
});

describe("Lead detail", () => {
  beforeEach(() => {
    vi.mocked(listCompanies).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(listContacts).mockResolvedValue({ items: [], limit: 100, nextCursor: null });
    vi.mocked(getLead).mockResolvedValue(qualified);
    vi.mocked(convertLead).mockReset();
    vi.mocked(transitionLead).mockReset();
  });

  it("shows convert only when qualified and calls the convert endpoint", async () => {
    const user = userEvent.setup();
    vi.mocked(convertLead).mockResolvedValue({
      lead: { ...qualified, status: "CONVERTED", convertedToDealId: "deal-1" },
      deal,
    });

    renderWithShell(
      <LeadDetailPage id="lead-1" />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] })
    );

    expect(await screen.findByRole("button", { name: "Convert to deal" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark contacted" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Convert to deal" }));
    await user.click(screen.getByRole("button", { name: "Confirm conversion" }));
    expect(convertLead).toHaveBeenCalledWith("lead-1");
    expect(routerMocks.push).toHaveBeenCalledWith("/crm/deals/deal-1");
  });

  it("surfaces conversion failure from the backend", async () => {
    const user = userEvent.setup();
    vi.mocked(convertLead).mockRejectedValue(
      new ApiClientError(409, {
        code: "ILLEGAL_STATE_TRANSITION",
        message: "Lead must be QUALIFIED to convert.",
        requestId: "r",
      })
    );
    renderWithShell(
      <LeadDetailPage id="lead-1" />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] })
    );
    await user.click(await screen.findByRole("button", { name: "Convert to deal" }));
    await user.click(screen.getByRole("button", { name: "Confirm conversion" }));
    expect(await screen.findByText("Lead must be QUALIFIED to convert.")).toBeInTheDocument();
  });

  it("does not convert from NEW", async () => {
    vi.mocked(getLead).mockResolvedValue({ ...qualified, status: "NEW" });
    renderWithShell(
      <LeadDetailPage id="lead-1" />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] })
    );
    expect(await screen.findByRole("button", { name: "Mark contacted" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Convert to deal" })).not.toBeInTheDocument();
  });

  it("disqualifies through transition, not PATCH status", async () => {
    const user = userEvent.setup();
    vi.mocked(transitionLead).mockResolvedValue({ ...qualified, status: "DISQUALIFIED" });
    renderWithShell(
      <LeadDetailPage id="lead-1" />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] })
    );
    await user.click(await screen.findByRole("button", { name: "Disqualify" }));
    await user.click(screen.getByRole("button", { name: "Confirm disqualify" }));
    expect(transitionLead).toHaveBeenCalledWith("lead-1", "DISQUALIFIED");
  });

  it("hides lifecycle actions without crm.manage", async () => {
    renderWithShell(<LeadDetailPage id="lead-1" />, createAuthContext({ permissions: ["crm.read"] }));
    await screen.findByRole("heading", { name: "Acme" });
    expect(screen.queryByRole("button", { name: "Convert to deal" })).not.toBeInTheDocument();
  });

  it("renders the non-enumerating state on 404", async () => {
    vi.mocked(getLead).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<LeadDetailPage id="missing" />, createAuthContext({ permissions: ["crm.read"] }));
    expect(
      await screen.findByRole("heading", {
        name: "This page doesn’t exist, or you don’t have access to it.",
      })
    ).toBeInTheDocument();
  });
});

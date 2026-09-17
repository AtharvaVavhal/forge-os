import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DealDetailPage, DealsPage } from "./deals-pages";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError } from "@forge/api-client";
import type { Deal } from "../api/types";

vi.mock("../api/crm-api", () => ({
  getDeal: vi.fn(),
  listDeals: vi.fn(),
  listCompanies: vi.fn(),
  listContacts: vi.fn(),
  updateDeal: vi.fn(),
  createDeal: vi.fn(),
  transitionDeal: vi.fn(),
  reopenDeal: vi.fn(),
  listActivities: vi.fn(),
}));

import { getDeal, listActivities, listCompanies, listContacts, listDeals, transitionDeal } from "../api/crm-api";

const openDeal: Deal = {
  id: "deal-1",
  organizationId: "org-1",
  title: "Workshop site",
  companyId: null,
  contactId: null,
  company: { id: "c1", name: "Acme" },
  contact: null,
  stage: "NEGOTIATION",
  estimatedValue: "25000.00",
  ownerId: "user-1",
  lostReason: null,
  nextFollowUpAt: null,
  reopenedFromDealId: null,
  archivedAt: null,
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: null,
};

describe("Deals list", () => {
  beforeEach(() => {
    vi.mocked(listCompanies).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(listContacts).mockResolvedValue({ items: [], limit: 100, nextCursor: null });
    vi.mocked(listDeals).mockResolvedValue({ items: [openDeal], page: 1, pageSize: 25, total: 1 });
  });

  it("renders deal fields from the API", async () => {
    renderWithShell(
      <DealsPage />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] })
    );
    expect(await screen.findByRole("link", { name: "Workshop site" })).toHaveAttribute(
      "href",
      "/crm/deals/deal-1"
    );
    expect(screen.getAllByText("Negotiation").length).toBeGreaterThan(0);
    expect(screen.getByText("₹25,000.00")).toBeInTheDocument();
  });

  it("hides create without crm.manage", async () => {
    renderWithShell(<DealsPage />, createAuthContext({ permissions: ["crm.read"] }));
    await screen.findByRole("link", { name: "Workshop site" });
    expect(screen.queryByRole("button", { name: "New deal" })).not.toBeInTheDocument();
  });
});

describe("Deal detail", () => {
  beforeEach(() => {
    vi.mocked(listCompanies).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(listContacts).mockResolvedValue({ items: [], limit: 100, nextCursor: null });
    vi.mocked(listActivities).mockResolvedValue({ items: [], limit: 25, nextCursor: null });
    vi.mocked(getDeal).mockResolvedValue(openDeal);
    vi.mocked(transitionDeal).mockReset();
  });

  it("requires a lost reason and posts a transition command", async () => {
    const user = userEvent.setup();
    vi.mocked(transitionDeal).mockResolvedValue({ ...openDeal, stage: "LOST", lostReason: "PRICE" });
    renderWithShell(
      <DealDetailPage id="deal-1" />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] })
    );
    await user.click(await screen.findByRole("button", { name: "Mark lost" }));
    await user.selectOptions(screen.getByLabelText(/lost reason/i), "TIMING");
    await user.click(screen.getByRole("button", { name: "Confirm lost" }));
    expect(transitionDeal).toHaveBeenCalledWith("deal-1", "LOST", "TIMING");
  });

  it("marks won via transition and surfaces the backend proposal rule", async () => {
    const user = userEvent.setup();
    vi.mocked(transitionDeal).mockRejectedValue(
      new ApiClientError(422, {
        code: "DEAL_WON_REQUIRES_ACCEPTED_PROPOSAL",
        message: "Deal cannot move to WON without an accepted proposal.",
        requestId: "r",
      })
    );
    renderWithShell(
      <DealDetailPage id="deal-1" />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage", "sales.manage"] })
    );
    await user.click(await screen.findByRole("button", { name: "Mark won" }));
    await user.click(screen.getByRole("button", { name: "Confirm won" }));
    expect(transitionDeal).toHaveBeenCalledWith("deal-1", "WON", undefined);
    expect(
      await screen.findAllByText("Deal cannot move to WON without an accepted proposal.")
    ).not.toHaveLength(0);
    expect(screen.getByRole("link", { name: "Create proposal for this deal" })).toHaveAttribute(
      "href",
      "/projects/proposals?dealId=deal-1"
    );
  });

  it("hides lifecycle actions without crm.manage", async () => {
    renderWithShell(<DealDetailPage id="deal-1" />, createAuthContext({ permissions: ["crm.read"] }));
    await screen.findByRole("heading", { name: "Workshop site" });
    expect(screen.queryByRole("button", { name: "Mark won" })).not.toBeInTheDocument();
  });
});

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DealDetailPage, DealsPage } from "./deals-pages";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError } from "@forge/api-client";
import type { Deal } from "../api/types";
import type { TeamMember } from "@/features/team/api/types";

vi.mock("../api/crm-api", () => ({
  getDeal: vi.fn(),
  listDeals: vi.fn(),
  listCompanies: vi.fn(),
  listContacts: vi.fn(),
  updateDeal: vi.fn(),
  createDeal: vi.fn(),
  transitionDeal: vi.fn(),
  reopenDeal: vi.fn(),
  bulkReassignDeals: vi.fn(),
  listActivities: vi.fn(),
}));

vi.mock("@/features/projects/api/projects-api", () => ({
  listProjects: vi.fn(),
}));

vi.mock("@/features/finance/api/finance-api", () => ({
  listInvoices: vi.fn(),
}));

vi.mock("@/features/team/api/team-api", () => ({
  listTeamMembers: vi.fn(),
}));

vi.mock("@/features/shared/components/notes-panel", () => ({
  NotesPanel: () => null,
}));

vi.mock("@/features/shared/components/documents-panel", () => ({
  DocumentsPanel: () => null,
}));

vi.mock("./activity-feed", () => ({
  ActivityFeed: () => null,
}));

import { getDeal, listActivities, listCompanies, listContacts, listDeals, transitionDeal, bulkReassignDeals } from "../api/crm-api";
import { listProjects } from "@/features/projects/api/projects-api";
import { listInvoices } from "@/features/finance/api/finance-api";
import { listTeamMembers } from "@/features/team/api/team-api";

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

const openDeal2: Deal = {
  ...openDeal,
  id: "deal-2",
  title: "Second site",
  ownerId: "user-1",
};

describe("Deals list", () => {
  beforeEach(() => {
    vi.mocked(listCompanies).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(listContacts).mockResolvedValue({ items: [], limit: 100, nextCursor: null });
    vi.mocked(listDeals).mockResolvedValue({ items: [openDeal], page: 1, pageSize: 25, total: 1 });
    vi.mocked(listTeamMembers).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(bulkReassignDeals).mockReset();
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

  it("bulk-reassigns selected deals with the correct payload and clears selection", async () => {
    const user = userEvent.setup();
    vi.mocked(listDeals).mockResolvedValue({
      items: [openDeal, openDeal2],
      page: 1,
      pageSize: 25,
      total: 2,
    });
    vi.mocked(listTeamMembers).mockResolvedValue({
      items: [
        {
          id: "user-2",
          organizationId: "org-1",
          email: "owner2@forge.test",
          name: "Owner Two",
          role: "SALES",
          active: true,
          lastLoginAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        } satisfies TeamMember,
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    });
    vi.mocked(bulkReassignDeals).mockResolvedValue({ count: 2 });

    renderWithShell(
      <DealsPage />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] })
    );

    await screen.findByRole("link", { name: "Workshop site" });
    await user.click(screen.getByRole("checkbox", { name: "Select Workshop site" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Second site" }));
    await user.click(screen.getByRole("button", { name: "Reassign (2)" }));

    await user.selectOptions(await screen.findByLabelText(/new owner/i), "user-2");
    await user.click(screen.getByRole("button", { name: "Confirm reassign" }));

    await waitFor(() =>
      expect(bulkReassignDeals).toHaveBeenCalledWith({
        ids: ["deal-1", "deal-2"],
        ownerId: "user-2",
      })
    );
    expect(await screen.findByText(/deals reassigned/i)).toBeInTheDocument();
    expect(screen.getByText(/2 deals updated/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reassign \(/ })).not.toBeInTheDocument();
  });

  it("surfaces bulk-reassign API failures without clearing selection", async () => {
    const user = userEvent.setup();
    vi.mocked(listDeals).mockResolvedValue({
      items: [openDeal, openDeal2],
      page: 1,
      pageSize: 25,
      total: 2,
    });
    vi.mocked(listTeamMembers).mockResolvedValue({
      items: [
        {
          id: "user-2",
          organizationId: "org-1",
          email: "owner2@forge.test",
          name: "Owner Two",
          role: "SALES",
          active: true,
          lastLoginAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        } satisfies TeamMember,
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    });
    vi.mocked(bulkReassignDeals).mockRejectedValue(
      new ApiClientError(422, {
        code: "VALIDATION_ERROR",
        message: "Owner is not in this organization.",
        requestId: "r-bulk",
      })
    );

    renderWithShell(
      <DealsPage />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] })
    );

    await screen.findByRole("link", { name: "Workshop site" });
    await user.click(screen.getByRole("checkbox", { name: "Select Workshop site" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Second site" }));
    await user.click(screen.getByRole("button", { name: "Reassign (2)" }));
    await user.selectOptions(await screen.findByLabelText(/new owner/i), "user-2");
    await user.click(screen.getByRole("button", { name: "Confirm reassign" }));

    expect(await screen.findByText(/reassign failed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reassign (2)" })).toBeInTheDocument();
  });
});

describe("Deal detail", () => {
  beforeEach(() => {
    vi.mocked(listCompanies).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(listContacts).mockResolvedValue({ items: [], limit: 100, nextCursor: null });
    vi.mocked(listActivities).mockResolvedValue({ items: [], limit: 25, nextCursor: null });
    vi.mocked(listProjects).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(listInvoices).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(listTeamMembers).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
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

  it("links a won deal to its generated project and explains async invoice drafting", async () => {
    vi.mocked(getDeal).mockResolvedValue({ ...openDeal, stage: "WON", companyId: "c1" });
    vi.mocked(listProjects).mockResolvedValue({
      items: [
        {
          id: "proj-won-1",
          organizationId: "org-1",
          name: "Workshop delivery",
          dealId: "deal-1",
          acceptedProposalId: "prop-1",
          companyId: "c1",
          company: { id: "c1", name: "Acme" },
          status: "ACTIVE",
          phase: "PLANNING",
          ownerId: "user-1",
          deadline: null,
          handoverChecklist: [],
          completedAt: null,
          createdAt: "2026-03-02T00:00:00.000Z",
          updatedAt: null,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    });
    vi.mocked(listInvoices).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });

    renderWithShell(
      <DealDetailPage id="deal-1" />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] })
    );

    expect(await screen.findByTestId("deal-won-orchestration")).toBeInTheDocument();
    expect(await screen.findByTestId("deal-won-project-link")).toHaveAttribute(
      "href",
      "/projects/proj-won-1"
    );
    expect(await screen.findByText(/Draft invoice status requires finance\.read/i)).toBeInTheDocument();
    expect(listProjects).toHaveBeenCalled();
    expect(listInvoices).not.toHaveBeenCalled();
  });

  it("discovers draft invoices via newest pageSize=100 list filtered by projectId", async () => {
    vi.mocked(getDeal).mockResolvedValue({ ...openDeal, stage: "WON", companyId: "c1" });
    vi.mocked(listProjects).mockResolvedValue({
      items: [
        {
          id: "proj-won-1",
          organizationId: "org-1",
          name: "Workshop delivery",
          dealId: "deal-1",
          acceptedProposalId: "prop-1",
          companyId: "c1",
          company: { id: "c1", name: "Acme" },
          status: "ACTIVE",
          phase: "PLANNING",
          ownerId: "user-1",
          deadline: null,
          handoverChecklist: [],
          completedAt: null,
          createdAt: "2026-03-02T00:00:00.000Z",
          updatedAt: null,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    });
    vi.mocked(listInvoices).mockResolvedValue({
      items: [
        {
          id: "inv-other",
          organizationId: "org-1",
          invoiceNumber: "INV-OTHER",
          status: "SENT",
          companyId: "c1",
          company: { id: "c1", name: "Acme" },
          projectId: "proj-other",
          financialYear: "2025-26",
          amount: "100.00",
          taxTreatment: "IGST",
          dueDate: null,
          sentAt: null,
          cancelledAt: null,
          cancellationReason: null,
          paidAmount: null,
          pendingAmount: null,
          billTo: null,
          version: 1,
          lineItems: [],
          payments: [],
          creditNotes: [],
          createdAt: "2026-03-03T00:00:00.000Z",
          updatedAt: null,
        },
        {
          id: "inv-draft-1",
          organizationId: "org-1",
          invoiceNumber: "INV-DRAFT-1",
          status: "DRAFT",
          companyId: "c1",
          company: { id: "c1", name: "Acme" },
          projectId: "proj-won-1",
          financialYear: "2025-26",
          amount: "25000.00",
          taxTreatment: "IGST",
          dueDate: null,
          sentAt: null,
          cancelledAt: null,
          cancellationReason: null,
          paidAmount: null,
          pendingAmount: null,
          billTo: null,
          version: 1,
          lineItems: [],
          payments: [],
          creditNotes: [],
          createdAt: "2026-03-02T01:00:00.000Z",
          updatedAt: null,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 2,
    });

    renderWithShell(
      <DealDetailPage id="deal-1" />,
      createAuthContext({
        role: "SALES",
        permissions: ["crm.read", "crm.manage", "finance.read"],
      })
    );

    expect(await screen.findByRole("link", { name: "INV-DRAFT-1" })).toHaveAttribute(
      "href",
      "/finance/invoices/inv-draft-1"
    );
    expect(screen.queryByText("INV-OTHER")).not.toBeInTheDocument();
    expect(listInvoices).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
      sort: "createdAt:desc",
    });
  });

  it("hides lifecycle actions without crm.manage", async () => {
    renderWithShell(<DealDetailPage id="deal-1" />, createAuthContext({ permissions: ["crm.read"] }));
    await screen.findByRole("heading", { name: "Workshop site" });
    expect(screen.queryByRole("button", { name: "Mark won" })).not.toBeInTheDocument();
  });
});

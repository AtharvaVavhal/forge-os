import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProposalDetailPage, ProposalsPage } from "./proposals-pages";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError } from "@forge/api-client";
import type { Proposal } from "../api/types";

vi.mock("../api/sales-api", () => ({
  listProposals: vi.fn(),
  getProposal: vi.fn(),
  createProposal: vi.fn(),
  updateProposal: vi.fn(),
  replaceProposalLineItems: vi.fn(),
  sendProposal: vi.fn(),
  reviseProposal: vi.fn(),
  transitionProposal: vi.fn(),
}));

vi.mock("@/features/crm/api/crm-api", () => ({
  listDeals: vi.fn(),
  listActivities: vi.fn(),
}));

import {
  createProposal,
  getProposal,
  listProposals,
  sendProposal,
  transitionProposal,
} from "../api/sales-api";
import { listActivities, listDeals } from "@/features/crm/api/crm-api";

const draft: Proposal = {
  id: "prop-1",
  organizationId: "org-1",
  dealId: "deal-1",
  deal: { id: "deal-1", name: "Workshop site" },
  version: 3,
  status: "DRAFT",
  terms: "Net 15",
  sentAt: null,
  viewedAt: null,
  acceptedAt: null,
  rejectedAt: null,
  expiresAt: null,
  createdBy: "user-1",
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: null,
  lineItems: [
    { id: "li-1", description: "Discovery", quantity: "2.00", unitPrice: "15000.00", taxRateId: null, sortOrder: 0 },
  ],
};

const sent: Proposal = {
  ...draft,
  id: "prop-2",
  version: 3,
  status: "SENT",
  sentAt: "2026-03-02T00:00:00.000Z",
};

describe("Proposals list", () => {
  beforeEach(() => {
    vi.mocked(listDeals).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(listProposals).mockResolvedValue({ items: [draft], page: 1, pageSize: 25, total: 1 });
  });

  it("renders version, deal, and status from the API", async () => {
    renderWithShell(
      <ProposalsPage />,
      createAuthContext({ role: "SALES", permissions: ["sales.read", "sales.manage"] })
    );
    expect(await screen.findByRole("link", { name: "Proposal v3" })).toHaveAttribute(
      "href",
      "/projects/proposals/prop-1"
    );
    expect(screen.getByRole("link", { name: "Workshop site" })).toHaveAttribute("href", "/crm/deals/deal-1");
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
  });

  it("hides create without sales.manage", async () => {
    renderWithShell(<ProposalsPage />, createAuthContext({ permissions: ["sales.read"] }));
    await screen.findByRole("link", { name: "Proposal v3" });
    expect(screen.queryByRole("button", { name: "New proposal" })).not.toBeInTheDocument();
  });

  it("validates deal selection on create", async () => {
    const user = userEvent.setup();
    renderWithShell(
      <ProposalsPage />,
      createAuthContext({ role: "SALES", permissions: ["sales.read", "sales.manage"] })
    );
    await screen.findByRole("link", { name: "Proposal v3" });
    await user.click(screen.getByRole("button", { name: "New proposal" }));
    await user.click(screen.getByRole("button", { name: "Create proposal" }));
    expect(await screen.findByText("Select a deal.")).toBeInTheDocument();
    expect(createProposal).not.toHaveBeenCalled();
  });

  it("shows a 403 alert instead of leaking records", async () => {
    vi.mocked(listProposals).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<ProposalsPage />, createAuthContext({ permissions: ["sales.read"] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
    expect(screen.queryByText("Proposal v3")).not.toBeInTheDocument();
  });

  it("shows session-expiry copy on 401 without leaking records", async () => {
    vi.mocked(listProposals).mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "expired", requestId: "r" })
    );
    renderWithShell(<ProposalsPage />, createAuthContext({ permissions: ["sales.read"] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your session expired. Sign in again.");
    expect(screen.queryByText("Proposal v3")).not.toBeInTheDocument();
  });
});

describe("Proposal detail", () => {
  beforeEach(() => {
    vi.mocked(listDeals).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(listActivities).mockResolvedValue({ items: [], limit: 25, nextCursor: null });
    vi.mocked(getProposal).mockResolvedValue(draft);
    vi.mocked(sendProposal).mockReset();
    vi.mocked(transitionProposal).mockReset();
  });

  it("shows version, line items, and INR rates without computing amount", async () => {
    renderWithShell(
      <ProposalDetailPage id="prop-1" />,
      createAuthContext({ role: "SALES", permissions: ["sales.read", "sales.manage"] })
    );
    expect(await screen.findByRole("heading", { name: "Proposal v3" })).toBeInTheDocument();
    expect(screen.getByText("Discovery")).toBeInTheDocument();
    expect(screen.getByText("₹15,000.00")).toBeInTheDocument();
    expect(screen.getByText(/does not multiply quantity/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept/i })).not.toBeInTheDocument();
  });

  it("sends a draft through the send command", async () => {
    const user = userEvent.setup();
    vi.mocked(sendProposal).mockResolvedValue({ ...draft, status: "SENT" });
    renderWithShell(
      <ProposalDetailPage id="prop-1" />,
      createAuthContext({ role: "SALES", permissions: ["sales.read", "sales.manage"] })
    );
    await user.click(await screen.findByRole("button", { name: "Send" }));
    await user.click(screen.getByRole("button", { name: "Send proposal" }));
    expect(sendProposal).toHaveBeenCalledWith("prop-1");
  });

  it("exposes viewed/rejected/expired on sent, not accept", async () => {
    const user = userEvent.setup();
    vi.mocked(getProposal).mockResolvedValue(sent);
    vi.mocked(transitionProposal).mockResolvedValue({ ...sent, status: "VIEWED" });
    renderWithShell(
      <ProposalDetailPage id="prop-2" />,
      createAuthContext({ role: "SALES", permissions: ["sales.read", "sales.manage"] })
    );
    expect(await screen.findByRole("button", { name: "Mark viewed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark rejected" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark expired" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark viewed" }));
    expect(transitionProposal).toHaveBeenCalledWith("prop-2", "VIEWED");
  });

  it("hides lifecycle actions without sales.manage", async () => {
    renderWithShell(<ProposalDetailPage id="prop-1" />, createAuthContext({ permissions: ["sales.read"] }));
    await screen.findByRole("heading", { name: "Proposal v3" });
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit draft" })).not.toBeInTheDocument();
  });

  it("renders the non-enumerating state on 404", async () => {
    vi.mocked(getProposal).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<ProposalDetailPage id="missing" />, createAuthContext({ permissions: ["sales.read"] }));
    expect(
      await screen.findByRole("heading", {
        name: "This page doesn’t exist, or you don’t have access to it.",
      })
    ).toBeInTheDocument();
  });

  it("does not offer send or transitions on accepted", async () => {
    vi.mocked(getProposal).mockResolvedValue({ ...draft, status: "ACCEPTED" });
    renderWithShell(
      <ProposalDetailPage id="prop-1" />,
      createAuthContext({ role: "SALES", permissions: ["sales.read", "sales.manage"] })
    );
    await screen.findByRole("heading", { name: "Proposal v3" });
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark viewed" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark rejected" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revise" })).toBeInTheDocument();
  });
});

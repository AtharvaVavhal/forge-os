import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./dashboard-page";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError, ApiNetworkError } from "@forge/api-client";

vi.mock("@/features/crm/api/crm-api", () => ({
  listProjects: vi.fn(),
  listForgeFundEntries: vi.fn(),
  getForgeFundBalance: vi.fn(),
}));

import { getForgeFundBalance, listForgeFundEntries, listProjects } from "@/features/crm/api/crm-api";

describe("Dashboard", () => {
  beforeEach(() => {
    vi.mocked(listProjects).mockReset();
    vi.mocked(listForgeFundEntries).mockReset();
    vi.mocked(getForgeFundBalance).mockReset();
  });

  it("renders the composition without invented metrics", async () => {
    vi.mocked(listProjects).mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    vi.mocked(getForgeFundBalance).mockResolvedValue("0.00");
    vi.mocked(listForgeFundEntries).mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0 });

    renderWithShell(
      <DashboardPage />,
      createAuthContext({ role: "FOUNDER_ADMIN", permissions: ["*"] })
    );

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Key indicators" })).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("₹4.82L")).not.toBeInTheDocument();
    expect(await screen.findByText("No projects")).toBeInTheDocument();
  });

  it("shows an unavailable state when the projects module 404s", async () => {
    vi.mocked(listProjects).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    vi.mocked(getForgeFundBalance).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    vi.mocked(listForgeFundEntries).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );

    renderWithShell(
      <DashboardPage />,
      createAuthContext({ role: "FOUNDER_ADMIN", permissions: ["*"] })
    );

    expect(await screen.findByText("Projects API unavailable")).toBeInTheDocument();
  });

  it("hides Forge Fund without forge_fund.read", async () => {
    vi.mocked(listProjects).mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    renderWithShell(
      <DashboardPage />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "projects.read"] })
    );
    await screen.findByText("No projects");
    expect(screen.queryByRole("heading", { name: "Forge Fund" })).not.toBeInTheDocument();
  });

  it("shows loading skeletons while project data is in flight", () => {
    vi.mocked(listProjects).mockImplementation(() => new Promise(() => undefined));
    vi.mocked(getForgeFundBalance).mockImplementation(() => new Promise(() => undefined));
    vi.mocked(listForgeFundEntries).mockImplementation(() => new Promise(() => undefined));
    renderWithShell(
      <DashboardPage />,
      createAuthContext({ role: "FOUNDER_ADMIN", permissions: ["*"] })
    );
    expect(screen.getAllByRole("status", { name: "Loading rows" }).length).toBeGreaterThan(0);
  });

  it("renders live project and forge-fund rows when the APIs return data", async () => {
    vi.mocked(listProjects).mockResolvedValue({
      items: [
        {
          id: "p1",
          name: "Atlas site",
          status: "ACTIVE",
          phase: "DEVELOPMENT",
          companyId: "c1",
          company: { id: "c1", name: "Acme" },
          ownerId: "user-1",
          deadline: "2026-04-01T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
    });
    vi.mocked(getForgeFundBalance).mockResolvedValue("12000.00");
    vi.mocked(listForgeFundEntries).mockResolvedValue({
      items: [
        {
          id: "e1",
          type: "CONTRIBUTION",
          amount: "12000.00",
          reason: "Payment contribution",
          sourceType: "payment",
          sourceId: "pay-1",
          approvedBy: null,
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 5,
      total: 1,
    });
    renderWithShell(
      <DashboardPage />,
      createAuthContext({ role: "FOUNDER_ADMIN", permissions: ["*"] })
    );
    expect(await screen.findByText("Atlas site")).toBeInTheDocument();
    expect(screen.getAllByText("₹12,000.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Payment contribution")).toBeInTheDocument();
  });

  it("shows a network error on the projects widget", async () => {
    vi.mocked(listProjects).mockRejectedValue(new ApiNetworkError(new Error("offline")));
    vi.mocked(getForgeFundBalance).mockResolvedValue("0.00");
    vi.mocked(listForgeFundEntries).mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0 });
    renderWithShell(
      <DashboardPage />,
      createAuthContext({ role: "FOUNDER_ADMIN", permissions: ["*"] })
    );
    expect(await screen.findByText("We couldn’t reach the API. Check your connection and try again.")).toBeInTheDocument();
  });
});

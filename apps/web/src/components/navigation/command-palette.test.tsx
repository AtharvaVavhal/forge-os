import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "./workspace-shell";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { routerMocks } from "@/test/setup";
import { ApiClientError } from "@forge/api-client";

vi.mock("@/features/shared/api/shared-api", async () => {
  const actual = await vi.importActual<typeof import("@/features/shared/api/shared-api")>(
    "@/features/shared/api/shared-api"
  );
  return {
    ...actual,
    searchRecords: vi.fn(),
  };
});

import { searchRecords } from "@/features/shared/api/shared-api";

describe("Command palette", () => {
  beforeEach(() => {
    vi.mocked(searchRecords).mockReset();
    vi.mocked(searchRecords).mockResolvedValue([]);
  });

  it("opens from the documented ⌘K / Ctrl+K shortcut and lists navigation", async () => {
    const user = userEvent.setup();
    renderWithShell(
      <WorkspaceShell>
        <p>Page</p>
      </WorkspaceShell>,
      createAuthContext({ role: "FOUNDER_ADMIN" })
    );

    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /invoices/i })).toBeInTheDocument();
  });

  it("filters commands and moves with the keyboard", async () => {
    const user = userEvent.setup();
    renderWithShell(
      <WorkspaceShell>
        <p>Page</p>
      </WorkspaceShell>,
      createAuthContext({ role: "FOUNDER_ADMIN" })
    );

    await user.click(screen.getByRole("button", { name: /search/i }));
    const input = screen.getByLabelText("Search navigation and records");
    await user.type(input, "lead");
    expect(screen.getByRole("option", { name: /leads/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /dashboard/i })).not.toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(routerMocks.push).toHaveBeenCalledWith("/crm/leads");
  });

  it("does not list finance commands the role cannot see", async () => {
    const user = userEvent.setup();
    renderWithShell(
      <WorkspaceShell>
        <p>Page</p>
      </WorkspaceShell>,
      createAuthContext({ role: "TEAM_MEMBER" })
    );

    await user.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("option", { name: /invoices/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("queries GET /search for entity hits and navigates", async () => {
    const user = userEvent.setup();
    vi.mocked(searchRecords).mockResolvedValue([{ id: "c1", entityType: "Company", title: "Acme Steel" }]);

    renderWithShell(
      <WorkspaceShell>
        <p>Page</p>
      </WorkspaceShell>,
      createAuthContext({ role: "FOUNDER_ADMIN" })
    );

    await user.click(screen.getByRole("button", { name: /search/i }));
    await user.type(screen.getByLabelText("Search navigation and records"), "Ac");
    expect(await screen.findByRole("option", { name: /acme steel/i })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /acme steel/i }));
    expect(routerMocks.push).toHaveBeenCalledWith("/crm/companies/c1");
  });

  it("shows search unavailable without inventing results", async () => {
    const user = userEvent.setup();
    vi.mocked(searchRecords).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );

    renderWithShell(
      <WorkspaceShell>
        <p>Page</p>
      </WorkspaceShell>,
      createAuthContext({ role: "FOUNDER_ADMIN" })
    );

    await user.click(screen.getByRole("button", { name: /search/i }));
    await user.type(screen.getByLabelText("Search navigation and records"), "Ac");
    expect(await screen.findByText("Search service is not currently available.")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /acme/i })).not.toBeInTheDocument();
  });

  it("shows loading indicator while search is in flight", async () => {
    const user = userEvent.setup();
    vi.mocked(searchRecords).mockReturnValue(new Promise(() => {}));

    renderWithShell(
      <WorkspaceShell>
        <p>Page</p>
      </WorkspaceShell>,
      createAuthContext({ role: "FOUNDER_ADMIN" })
    );

    await user.click(screen.getByRole("button", { name: /search/i }));
    await user.type(screen.getByLabelText("Search navigation and records"), "Ac");
    expect(await screen.findByText("Searching…")).toBeInTheDocument();
  });

  it("shows no matching records message when search returns empty", async () => {
    const user = userEvent.setup();
    vi.mocked(searchRecords).mockResolvedValue([]);

    renderWithShell(
      <WorkspaceShell>
        <p>Page</p>
      </WorkspaceShell>,
      createAuthContext({ role: "FOUNDER_ADMIN" })
    );

    await user.click(screen.getByRole("button", { name: /search/i }));
    await user.type(screen.getByLabelText("Search navigation and records"), "Zz");
    expect(await screen.findByText("No matching records")).toBeInTheDocument();
  });
});

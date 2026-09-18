import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./sidebar";
import { WorkspaceShell } from "./workspace-shell";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { navigationState } from "@/test/setup";

describe("Sidebar", () => {
  const founder = createAuthContext({ role: "FOUNDER_ADMIN", permissions: ["*"] });

  it("renders grouped workspace navigation", () => {
    navigationState.pathname = "/dashboard";
    renderWithShell(<Sidebar />, founder);

    const nav = screen.getByRole("navigation", { name: "Workspace" });
    expect(within(nav).getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard");
    expect(within(nav).getByRole("link", { name: /leads/i })).toBeInTheDocument();
    expect(within(nav).getByText("CRM")).toBeInTheDocument();
    expect(within(nav).getByText("Finance")).toBeInTheDocument();
    expect(screen.queryByText("Payouts")).not.toBeInTheDocument();
  });

  it("marks the active route", () => {
    navigationState.pathname = "/crm/leads";
    renderWithShell(<Sidebar />, founder);

    expect(screen.getByRole("link", { name: /leads/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /dashboard/i })).not.toHaveAttribute("aria-current");
  });

  it("marks a nested CRM detail route without activating Projects", () => {
    navigationState.pathname = "/crm/leads/lead-1";
    renderWithShell(<Sidebar />, founder);

    expect(screen.getByRole("link", { name: /leads/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /^projects$/i })).not.toHaveAttribute("aria-current");
  });

  it("collapses the persistent sidebar on toggle", async () => {
    const user = userEvent.setup();
    window.matchMedia = (query: string) =>
      ({
        matches: query.includes("min-width: 1280px"),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList;

    renderWithShell(<Sidebar />, founder);

    const aside = screen.getByRole("complementary", { name: "Workspace navigation" });
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(aside).toHaveAttribute("data-collapsed", "true");
  });

  it("opens overlay navigation for the mobile trigger path", async () => {
    const user = userEvent.setup();
    renderWithShell(
      <WorkspaceShell>
        <p>Content</p>
      </WorkspaceShell>,
      founder
    );

    expect(screen.getAllByRole("navigation", { name: "Workspace" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getAllByRole("navigation", { name: "Workspace" }).length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: "Close navigation" })).toBeInTheDocument();
  });

  it("hides finance links for a team member", () => {
    renderWithShell(<Sidebar />, createAuthContext({ role: "TEAM_MEMBER" }));
    expect(screen.queryByRole("link", { name: /invoices/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
  });
});

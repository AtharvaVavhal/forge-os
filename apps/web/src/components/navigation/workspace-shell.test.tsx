import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceShell } from "./workspace-shell";
import { createAuthContext, renderWithAuth } from "@/test/test-utils";
import { LoginForm } from "@/features/auth/components/login-form";
import { renderWithQuery } from "@/test/test-utils";

describe("authenticated workspace shell", () => {
  it("renders the protected shell chrome around workspace content", () => {
    renderWithAuth(
      <WorkspaceShell>
        <h1>Workspace body</h1>
      </WorkspaceShell>,
      createAuthContext({ role: "OPERATIONS" })
    );

    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#workspace-main"
    );
    expect(screen.getByRole("navigation", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Workspace body" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /atharva/i })).toBeInTheDocument();
  });

  it("does not render workspace navigation on the login surface", () => {
    renderWithQuery(<LoginForm googleSsoHref={null} />);
    expect(screen.queryByRole("navigation", { name: "Workspace" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open command palette" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});

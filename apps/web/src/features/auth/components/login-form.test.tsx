import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiClientError } from "@forge/api-client";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";
import { renderWithQuery } from "@/test/test-utils";

describe("LoginForm", () => {
  it("renders email, password, submit, and the Google Workspace boundary", () => {
    renderWithQuery(<LoginForm googleSsoHref="/api/v1/auth/google/start" />);

    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue with Google Workspace" })).toHaveAttribute(
      "href",
      "/api/v1/auth/google/start"
    );
  });

  it("hides the SSO boundary when the contract href is not provided", () => {
    renderWithQuery(<LoginForm googleSsoHref={null} />);
    expect(screen.queryByRole("link", { name: "Continue with Google Workspace" })).not.toBeInTheDocument();
  });

  it("validates empty fields without calling the API", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    renderWithQuery(<LoginForm onLogin={onLogin} googleSsoHref={null} />);

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter your email.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("shows a loading state and prevents a second submit", async () => {
    const user = userEvent.setup();
    let resolveLogin: () => void = () => undefined;
    const onLogin = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLogin = resolve;
        })
    );

    renderWithQuery(<LoginForm onLogin={onLogin} googleSsoHref={null} />);

    await user.type(screen.getByLabelText(/^email/i), "atharva@forgebuilds.in");
    await user.type(screen.getByLabelText(/^password/i), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const submitting = await screen.findByRole("button", { name: "Signing in" });
    expect(submitting).toBeDisabled();
    expect(screen.getByLabelText(/^email/i)).toBeDisabled();

    await user.click(submitting);
    expect(onLogin).toHaveBeenCalledTimes(1);

    resolveLogin();
  });

  it("shows a generic invalid-credentials state on 401", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockRejectedValue(
      new ApiClientError(401, {
        code: "UNAUTHORIZED",
        message: "should not be shown verbatim as the only signal",
        requestId: "req-1",
      })
    );

    renderWithQuery(<LoginForm onLogin={onLogin} googleSsoHref={null} />);
    await user.type(screen.getByLabelText(/^email/i), "atharva@forgebuilds.in");
    await user.type(screen.getByLabelText(/^password/i), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Email or password is incorrect.")).toBeInTheDocument();
  });

  it("shows an inactive-account state when the backend code says so", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockRejectedValue(
      new ApiClientError(403, {
        code: "ACCOUNT_INACTIVE",
        message: "ignored",
        requestId: "req-1",
      })
    );

    renderWithQuery(<LoginForm onLogin={onLogin} googleSsoHref={null} />);
    await user.type(screen.getByLabelText(/^email/i), "atharva@forgebuilds.in");
    await user.type(screen.getByLabelText(/^password/i), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(/this account is inactive/i)).toBeInTheDocument();
  });

  it("shows the session-expired notice", () => {
    renderWithQuery(<LoginForm expired googleSsoHref={null} />);
    expect(screen.getByText("Your session expired. Sign in again.")).toBeInTheDocument();
  });

  it("supports keyboard submit via Enter", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockResolvedValue(undefined);

    renderWithQuery(<LoginForm onLogin={onLogin} googleSsoHref={null} />);
    await user.type(screen.getByLabelText(/^email/i), "atharva@forgebuilds.in");
    await user.type(screen.getByLabelText(/^password/i), "secret{Enter}");

    expect(onLogin).toHaveBeenCalledWith({
      email: "atharva@forgebuilds.in",
      password: "secret",
    });
  });

  it("does not write credentials or tokens to localStorage", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    renderWithQuery(<LoginForm onLogin={onLogin} googleSsoHref={null} />);
    await user.type(screen.getByLabelText(/^email/i), "atharva@forgebuilds.in");
    await user.type(screen.getByLabelText(/^password/i), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await vi.waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

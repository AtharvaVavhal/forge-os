import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { ApiClientError, ApiNetworkError } from "@forge/api-client";
import { PortalLoginPage } from "./portal-login-page";
import { PortalShell } from "./portal-shell";
import * as portalApi from "../api/portal-api";
import { renderWithPortal, createPortalAuthContext } from "@/test/test-utils";

const pushMock = vi.fn();
const refreshMock = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
  usePathname: () => "/portal",
  useSearchParams: () => mockSearchParams,
}));

describe("Portal Authentication & Login Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it("validates empty email and password inputs", async () => {
    renderWithPortal(<PortalLoginPage />);

    const submitBtn = screen.getByTestId("portal-login-submit-button");
    fireEvent.click(submitBtn);

    expect(await screen.findByTestId("portal-login-email-error")).toHaveTextContent("Enter your email.");
    expect(await screen.findByTestId("portal-login-password-error")).toHaveTextContent("Enter your password.");
    expect(screen.getByTestId("portal-login-email-input")).toHaveAttribute(
      "aria-describedby",
      "portal-email-error"
    );
    expect(screen.getByTestId("portal-login-password-input")).toHaveAttribute(
      "aria-describedby",
      "portal-password-error"
    );
  });

  it("validates malformed email input", async () => {
    renderWithPortal(<PortalLoginPage />);

    const emailInput = screen.getByTestId("portal-login-email-input");
    const passwordInput = screen.getByTestId("portal-login-password-input");

    fireEvent.change(emailInput, { target: { value: "not-an-email" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });

    const submitBtn = screen.getByTestId("portal-login-submit-button");
    fireEvent.click(submitBtn);

    expect(await screen.findByTestId("portal-login-email-error")).toHaveTextContent("Enter a valid email address.");
  });

  it("handles successful client login and redirects to /portal", async () => {
    vi.spyOn(portalApi, "loginPortal").mockResolvedValue({
      id: "client-1",
      organizationId: "org-1",
      companyId: "comp-1",
      contactId: "contact-1",
      email: "client@acme.corp",
      active: true,
      lastLoginAt: null,
      createdAt: null,
      company: { id: "comp-1", name: "Acme Corp" },
    });

    renderWithPortal(<PortalLoginPage />);

    const emailInput = screen.getByTestId("portal-login-email-input");
    const passwordInput = screen.getByTestId("portal-login-password-input");

    fireEvent.change(emailInput, { target: { value: "client@acme.corp" } });
    fireEvent.change(passwordInput, { target: { value: "secret123" } });

    const submitBtn = screen.getByTestId("portal-login-submit-button");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(portalApi.loginPortal).toHaveBeenCalledWith({
        email: "client@acme.corp",
        password: "secret123",
      });
      expect(pushMock).toHaveBeenCalledWith("/portal");
    });
  });

  it("handles 401 Invalid Credentials with generic message (no enumeration)", async () => {
    vi.spyOn(portalApi, "loginPortal").mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "Invalid credentials.", requestId: "req-test" })
    );

    renderWithPortal(<PortalLoginPage />);

    fireEvent.change(screen.getByTestId("portal-login-email-input"), {
      target: { value: "client@acme.corp" },
    });
    fireEvent.change(screen.getByTestId("portal-login-password-input"), {
      target: { value: "wrong-password" },
    });

    fireEvent.click(screen.getByTestId("portal-login-submit-button"));

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
  });

  it("handles inactive client account explicitly", async () => {
    vi.spyOn(portalApi, "loginPortal").mockRejectedValue(
      new ApiClientError(403, { code: "CLIENT_INACTIVE", message: "Client is inactive.", requestId: "req-test" })
    );

    renderWithPortal(<PortalLoginPage />);

    fireEvent.change(screen.getByTestId("portal-login-email-input"), {
      target: { value: "inactive@acme.corp" },
    });
    fireEvent.change(screen.getByTestId("portal-login-password-input"), {
      target: { value: "secret" },
    });

    fireEvent.click(screen.getByTestId("portal-login-submit-button"));

    expect(await screen.findByText("This portal account is inactive. Please contact your account manager.")).toBeInTheDocument();
  });

  it("handles 429 Rate Limit error", async () => {
    vi.spyOn(portalApi, "loginPortal").mockRejectedValue(
      new ApiClientError(429, { code: "RATE_LIMITED", message: "Too many attempts.", requestId: "req-test" })
    );

    renderWithPortal(<PortalLoginPage />);

    fireEvent.change(screen.getByTestId("portal-login-email-input"), {
      target: { value: "client@acme.corp" },
    });
    fireEvent.change(screen.getByTestId("portal-login-password-input"), {
      target: { value: "secret" },
    });

    fireEvent.click(screen.getByTestId("portal-login-submit-button"));

    expect(await screen.findByText("Too many sign-in attempts. Please wait a moment and try again.")).toBeInTheDocument();
  });

  it("handles network failure gracefully", async () => {
    vi.spyOn(portalApi, "loginPortal").mockRejectedValue(
      new ApiNetworkError(new Error("Failed to fetch"))
    );

    renderWithPortal(<PortalLoginPage />);

    fireEvent.change(screen.getByTestId("portal-login-email-input"), {
      target: { value: "client@acme.corp" },
    });
    fireEvent.change(screen.getByTestId("portal-login-password-input"), {
      target: { value: "secret" },
    });

    fireEvent.click(screen.getByTestId("portal-login-submit-button"));

    expect(await screen.findByText("Unable to reach the portal service. Check your connection and try again.")).toBeInTheDocument();
  });

  it("shows session expired message if reason=session_expired param is present", () => {
    mockSearchParams = new URLSearchParams("reason=session_expired");

    renderWithPortal(<PortalLoginPage />);

    expect(screen.getByText("Session Expired")).toBeInTheDocument();
    expect(screen.getByText(/Your portal session has expired/)).toBeInTheDocument();
  });

  it("executes portal logout flow and redirects to login", async () => {
    const logoutSpy = vi.spyOn(portalApi, "logoutPortal").mockResolvedValue(undefined);
    const authContext = createPortalAuthContext({ email: "user@client.com" });

    renderWithPortal(
      <PortalShell>
        <div>Protected Portal Content</div>
      </PortalShell>,
      authContext
    );

    expect(screen.getByTestId("portal-user-email")).toHaveTextContent("user@client.com");

    const logoutBtn = screen.getByTestId("portal-logout-button");
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(logoutSpy).toHaveBeenCalled();
      expect(pushMock).toHaveBeenCalledWith("/portal/login");
    });
  });
});

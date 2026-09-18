import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/test-utils";
import { GateScreen } from "./gate-screen";
import { MirrorScreen } from "./mirror-screen";
import { OrientationScreen } from "./orientation-screen";

vi.mock("@/features/auth/api/auth-api", () => ({
  previewInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  completeOnboarding: vi.fn(),
}));

import { acceptInvitation, previewInvitation } from "@/features/auth/api/auth-api";

const mockPreview = vi.mocked(previewInvitation);
const mockAccept = vi.mocked(acceptInvitation);

describe("GateScreen", () => {
  it("renders invitation copy and Google CTA for a valid preview", async () => {
    mockPreview.mockResolvedValue({
      email: "priya@forgebuilds.in",
      role: "TEAM_MEMBER",
      inviterName: "Atharva",
      organizationName: "FORGE",
    });

    renderWithQuery(<GateScreen token="abc" />);

    expect(await screen.findByRole("heading", { name: /you've been invited to forge/i })).toBeInTheDocument();
    expect(screen.getByText(/Atharva invited you to join as Team Member/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it("shows a generic invalid state without leaking invitation status", async () => {
    mockPreview.mockRejectedValue(new Error("invalid"));
    renderWithQuery(<GateScreen token="bad" />);

    expect(
      await screen.findByRole("heading", { name: /invalid or has expired/i })
    ).toBeInTheDocument();
  });

  it("accepts without a password then navigates to Google SSO", async () => {
    mockPreview.mockResolvedValue({
      email: "priya@forgebuilds.in",
      role: "TEAM_MEMBER",
      inviterName: "Atharva",
      organizationName: "FORGE",
    });
    mockAccept.mockResolvedValue(undefined);
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    const user = userEvent.setup();
    renderWithQuery(<GateScreen token="tok" />);
    await screen.findByRole("button", { name: /continue with google/i });
    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(mockAccept).toHaveBeenCalledWith("tok");
    expect(assign).toHaveBeenCalledWith("/api/v1/auth/google/start");
    vi.unstubAllGlobals();
  });

  it("does not render the raw invitation token or persist it", async () => {
    const rawToken = "super-secret-invite-token-xyz";
    mockPreview.mockResolvedValue({
      email: "priya@forgebuilds.in",
      role: "TEAM_MEMBER",
      inviterName: "Atharva",
      organizationName: "FORGE",
    });

    const { queryClient } = renderWithQuery(<GateScreen token={rawToken} />);
    await screen.findByRole("heading", { name: /you've been invited to forge/i });

    expect(screen.queryByText(rawToken)).not.toBeInTheDocument();
    expect(window.localStorage?.getItem(rawToken) ?? null).toBeNull();
    expect(window.sessionStorage?.getItem(rawToken) ?? null).toBeNull();
    expect(JSON.stringify([...queryClient.getQueryCache().getAll().map((q) => q.queryKey)])).not.toContain(
      rawToken
    );
  });
});

describe("MirrorScreen", () => {
  it("shows name and role and advances on click", async () => {
    const onAdvance = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<MirrorScreen name="Priya Sharma" role="TEAM_MEMBER" onAdvance={onAdvance} />);

    expect(screen.getByRole("heading", { name: /Priya Sharma\./i })).toBeInTheDocument();
    expect(screen.getByText(/TEAM MEMBER · FORGE/i)).toBeInTheDocument();

    await user.click(screen.getByRole("main"));
    expect(onAdvance).toHaveBeenCalled();
  });
});

describe("OrientationScreen", () => {
  it("has a single Enter Forge CTA", async () => {
    const onEnter = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<OrientationScreen role="TEAM_MEMBER" onEnter={onEnter} />);

    expect(screen.getByRole("heading", { name: /your workspace/i })).toBeInTheDocument();
    expect(screen.queryByText(/complete your profile/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /enter forge/i }));
    expect(onEnter).toHaveBeenCalled();
  });
});

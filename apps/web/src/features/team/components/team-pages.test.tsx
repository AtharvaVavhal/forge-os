import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MembersPage } from "./members-page";
import { WorkloadPage } from "./workload-page";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError, ApiNetworkError } from "@forge/api-client";
import type { TeamMember } from "../api/types";

vi.mock("../api/team-api", () => ({
  listTeamMembers: vi.fn(),
  getTeamWorkload: vi.fn(),
  createTeamInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
}));

import { createTeamInvitation, getTeamWorkload, listTeamMembers } from "../api/team-api";

const member: TeamMember = {
  id: "u1",
  organizationId: "org-1",
  email: "ops@forgebuilds.in",
  name: "Ops Lead",
  role: "OPERATIONS",
  active: true,
  lastLoginAt: "2026-03-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const manage = createAuthContext({
  role: "FOUNDER_ADMIN",
  permissions: ["users.read", "users.manage", "team.workload.read"],
});

describe("Team members", () => {
  beforeEach(() => {
    vi.mocked(listTeamMembers).mockResolvedValue({ items: [member], page: 1, pageSize: 25, total: 1 });
    vi.mocked(createTeamInvitation).mockReset();
  });

  it("lists documented member fields", async () => {
    renderWithShell(<MembersPage />, manage);
    expect(await screen.findByText("Ops Lead")).toBeInTheDocument();
    expect(screen.getByText("ops@forgebuilds.in")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText(/payout/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/salary/i)).not.toBeInTheDocument();
  });

  it("hides invite without users.manage", async () => {
    renderWithShell(<MembersPage />, createAuthContext({ permissions: ["users.read"] }));
    await screen.findByText("Ops Lead");
    expect(screen.queryByRole("button", { name: "Invite member" })).not.toBeInTheDocument();
  });

  it("validates invite email", async () => {
    const user = userEvent.setup();
    renderWithShell(<MembersPage />, manage);
    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(createTeamInvitation).not.toHaveBeenCalled();
  });

  it("shows loading state while fetching members", () => {
    vi.mocked(listTeamMembers).mockReturnValue(new Promise(() => {}));
    renderWithShell(<MembersPage />, manage);
    expect(screen.getByText("Loading records")).toBeInTheDocument();
  });

  it("shows empty state when no members exist", async () => {
    vi.mocked(listTeamMembers).mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    renderWithShell(<MembersPage />, manage);
    expect(await screen.findByText("No members")).toBeInTheDocument();
  });

  it("renders the invite form with email, role, and domain guidance", async () => {
    const user = userEvent.setup();
    renderWithShell(<MembersPage />, manage);
    await user.click(await screen.findByRole("button", { name: "Invite member" }));

    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^role/i)).toBeInTheDocument();
    expect(screen.getByText(/Google Workspace address/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/aadhaar/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/upi/i)).not.toBeInTheDocument();
  });

  it("shows Invitation sent when emailSent is true and never renders a raw token", async () => {
    const user = userEvent.setup();
    const leakToken = "raw-invitation-token-abcdef0123456789";
    vi.mocked(createTeamInvitation).mockResolvedValue({
      invitation: { id: "inv-1", email: "newbie@forgebuilds.in" },
      emailSent: true,
    });
    renderWithShell(<MembersPage />, manage);

    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    await user.type(screen.getByLabelText(/email/i), "newbie@forgebuilds.in");
    await user.selectOptions(screen.getByLabelText(/role/i), "SALES");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(createTeamInvitation).toHaveBeenCalledWith({
      scope: "TEAM",
      email: "newbie@forgebuilds.in",
      userRole: "SALES",
    });
    expect(await screen.findByText("Invitation sent.")).toBeInTheDocument();
    expect(screen.getByText("Invitation sent to newbie@forgebuilds.in.")).toBeInTheDocument();
    expect(screen.queryByText(leakToken)).not.toBeInTheDocument();
    expect(screen.queryByText(/raw token/i)).not.toBeInTheDocument();
    expect(window.localStorage?.getItem(leakToken) ?? null).toBeNull();
    expect(window.sessionStorage?.getItem(leakToken) ?? null).toBeNull();
  });

  it("does not claim Invitation sent when emailSent is false", async () => {
    const user = userEvent.setup();
    vi.mocked(createTeamInvitation).mockResolvedValue({
      invitation: { id: "inv-2", email: "newbie@forgebuilds.in" },
      emailSent: false,
    });
    renderWithShell(<MembersPage />, manage);

    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    await user.type(screen.getByLabelText(/email/i), "newbie@forgebuilds.in");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(
      await screen.findByText("Invitation created, but the email could not be sent.")
    ).toBeInTheDocument();
    expect(screen.getByText(/invitation for newbie@forgebuilds\.in was saved/i)).toBeInTheDocument();
    expect(screen.queryByText("Invitation sent.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Invitation sent to/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Resend/i)).not.toBeInTheDocument();
  });

  it("hides FOUNDER_ADMIN invite option for non-founder callers", async () => {
    const user = userEvent.setup();
    renderWithShell(
      <MembersPage />,
      createAuthContext({
        role: "OPERATIONS",
        permissions: ["users.read", "users.manage"],
      })
    );
    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    const options = Array.from(screen.getByLabelText(/role/i).querySelectorAll("option")).map(
      (el) => el.getAttribute("value")
    );
    expect(options).not.toContain("FOUNDER_ADMIN");
    expect(options).toEqual(
      expect.arrayContaining(["OPERATIONS", "FINANCE", "SALES", "TEAM_MEMBER"])
    );
  });

  it("shows FOUNDER_ADMIN invite option for founder callers", async () => {
    const user = userEvent.setup();
    renderWithShell(<MembersPage />, manage);
    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    const options = Array.from(screen.getByLabelText(/role/i).querySelectorAll("option")).map(
      (el) => el.getAttribute("value")
    );
    expect(options).toContain("FOUNDER_ADMIN");
  });

  it("surfaces invite validation failure from the API", async () => {
    const user = userEvent.setup();
    vi.mocked(createTeamInvitation).mockRejectedValue(
      new ApiClientError(400, {
        code: "INVITATION_USER_ROLE_REQUIRED",
        message: "A role is required for a team invitation.",
        requestId: "r",
      })
    );
    renderWithShell(<MembersPage />, manage);
    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    await user.type(screen.getByLabelText(/email/i), "newbie@forgebuilds.in");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("Couldn’t invite")).toBeInTheDocument();
    expect(screen.getByText("A role is required for a team invitation.")).toBeInTheDocument();
  });

  it("shows session expiry on invite 401", async () => {
    const user = userEvent.setup();
    vi.mocked(createTeamInvitation).mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "expired", requestId: "r" })
    );
    renderWithShell(<MembersPage />, manage);
    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    await user.type(screen.getByLabelText(/email/i), "newbie@forgebuilds.in");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("Couldn’t invite")).toBeInTheDocument();
    expect(screen.getByText("Your session expired. Sign in again.")).toBeInTheDocument();
  });

  it("shows authorization error on invite 403", async () => {
    const user = userEvent.setup();
    vi.mocked(createTeamInvitation).mockRejectedValue(
      new ApiClientError(403, {
        code: "FORBIDDEN_PERMISSION",
        message: "You don't have permission to do this.",
        requestId: "r",
      })
    );
    renderWithShell(<MembersPage />, manage);
    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    await user.type(screen.getByLabelText(/email/i), "newbie@forgebuilds.in");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("Couldn’t invite")).toBeInTheDocument();
    expect(screen.getByText("You don’t have permission to do this.")).toBeInTheDocument();
  });

  it("handles duplicate/conflict invitation 409 safely", async () => {
    const user = userEvent.setup();
    vi.mocked(createTeamInvitation).mockRejectedValue(
      new ApiClientError(409, {
        code: "INVITATION_ALREADY_FINAL",
        message: "This invitation has already been used or revoked.",
        requestId: "r",
      })
    );
    renderWithShell(<MembersPage />, manage);
    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    await user.type(screen.getByLabelText(/email/i), "newbie@forgebuilds.in");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("Couldn’t invite")).toBeInTheDocument();
    expect(screen.getByText("This invitation has already been used or revoked.")).toBeInTheDocument();
  });

  it("shows a generic safe error on invite 500/503 without provider details", async () => {
    const user = userEvent.setup();
    vi.mocked(createTeamInvitation).mockRejectedValue(
      new ApiClientError(503, {
        code: "EMAIL_NOT_CONFIGURED",
        message: "Resend API key missing for account acct_secret",
        requestId: "r",
      })
    );
    renderWithShell(<MembersPage />, manage);
    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    await user.type(screen.getByLabelText(/email/i), "newbie@forgebuilds.in");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("Couldn’t invite")).toBeInTheDocument();
    expect(screen.getByText("The service is temporarily unavailable. Try again shortly.")).toBeInTheDocument();
    expect(screen.queryByText(/Resend/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/acct_secret/i)).not.toBeInTheDocument();
  });

  it("shows unavailable on 404 instead of zero members", async () => {
    vi.mocked(listTeamMembers).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<MembersPage />, manage);
    expect(await screen.findByText("Service is not currently available.")).toBeInTheDocument();
    expect(screen.queryByText("Ops Lead")).not.toBeInTheDocument();
  });

  it("shows 403 without leaking members", async () => {
    vi.mocked(listTeamMembers).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<MembersPage />, createAuthContext({ permissions: [] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
    expect(screen.queryByText("Ops Lead")).not.toBeInTheDocument();
  });

  it("shows session expiry on 401", async () => {
    vi.mocked(listTeamMembers).mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "expired", requestId: "r" })
    );
    renderWithShell(<MembersPage />, manage);
    expect(await screen.findByText("Your session expired. Sign in again.")).toBeInTheDocument();
  });
});

describe("Team workload", () => {
  beforeEach(() => {
    vi.mocked(getTeamWorkload).mockResolvedValue({
      rows: [
        {
          userId: "u1",
          name: "Ops Lead",
          email: "ops@forgebuilds.in",
          role: "OPERATIONS",
          openTaskCount: 3,
          timeEntryCount: 12,
        },
      ],
    });
  });

  it("renders API workload counts only", async () => {
    renderWithShell(<WorkloadPage />, manage);
    expect(await screen.findByText("Ops Lead")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByText(/60\/40/)).not.toBeInTheDocument();
    expect(screen.queryByText(/TeamPayout/)).not.toBeInTheDocument();
  });

  it("shows loading state while fetching workload", () => {
    vi.mocked(getTeamWorkload).mockReturnValue(new Promise(() => {}));
    renderWithShell(<WorkloadPage />, manage);
    expect(screen.getByText("Loading records")).toBeInTheDocument();
  });

  it("shows empty without inventing zeros as money", async () => {
    vi.mocked(getTeamWorkload).mockResolvedValue({ rows: [] });
    renderWithShell(<WorkloadPage />, manage);
    expect(await screen.findByText("No workload rows")).toBeInTheDocument();
  });

  it("shows unavailable on 404 instead of empty report", async () => {
    vi.mocked(getTeamWorkload).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<WorkloadPage />, manage);
    expect(await screen.findByText("Service is not currently available.")).toBeInTheDocument();
    expect(screen.queryByText("Ops Lead")).not.toBeInTheDocument();
  });

  it("shows 403 forbidden state without leaking workload", async () => {
    vi.mocked(getTeamWorkload).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<WorkloadPage />, createAuthContext({ permissions: [] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
    expect(screen.queryByText("Ops Lead")).not.toBeInTheDocument();
  });

  it("shows session expiry on 401 for workload", async () => {
    vi.mocked(getTeamWorkload).mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "expired", requestId: "r" })
    );
    renderWithShell(<WorkloadPage />, manage);
    expect(await screen.findByText("Your session expired. Sign in again.")).toBeInTheDocument();
  });

  it("surfaces network failure", async () => {
    vi.mocked(getTeamWorkload).mockRejectedValue(new ApiNetworkError(new Error("offline")));
    renderWithShell(<WorkloadPage />, manage);
    expect(await screen.findByText("We couldn’t reach the API. Check your connection and try again.")).toBeInTheDocument();
  });
});

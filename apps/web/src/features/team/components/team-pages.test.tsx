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

  it("successfully sends an invitation", async () => {
    const user = userEvent.setup();
    vi.mocked(createTeamInvitation).mockResolvedValue(undefined);
    renderWithShell(<MembersPage />, manage);

    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    await user.type(screen.getByLabelText(/email/i), "newbie@forgebuilds.in");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(createTeamInvitation).toHaveBeenCalledWith({
      scope: "TEAM",
      email: "newbie@forgebuilds.in",
      userRole: "TEAM_MEMBER",
    });
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

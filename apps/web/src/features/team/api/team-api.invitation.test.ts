import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/browser-mutate", () => ({
  browserMutate: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

import { browserMutate } from "@/lib/api/browser-mutate";
import { parseCreateInvitationResult } from "./parse";
import { teamKeys } from "./query-keys";
import { createTeamInvitation } from "./team-api";
import { teamPaths } from "./paths";

describe("createTeamInvitation", () => {
  beforeEach(() => {
    vi.mocked(browserMutate).mockReset();
  });

  it("POSTs via browserMutate (CSRF path) and returns emailSent without a raw token", async () => {
    vi.mocked(browserMutate).mockResolvedValue({
      invitation: { id: "inv-1", email: "new@forgebuilds.in" },
      emailSent: true,
      token: "raw-secret-token-must-never-leak",
    });

    const result = await createTeamInvitation({
      scope: "TEAM",
      email: "new@forgebuilds.in",
      userRole: "TEAM_MEMBER",
    });

    expect(browserMutate).toHaveBeenCalledWith("POST", teamPaths.invitations, {
      body: {
        scope: "TEAM",
        email: "new@forgebuilds.in",
        userRole: "TEAM_MEMBER",
      },
    });
    expect(result).toEqual({
      invitation: { id: "inv-1", email: "new@forgebuilds.in" },
      emailSent: true,
    });
    expect(result).not.toHaveProperty("token");
  });

  it("surfaces emailSent=false when delivery failed", async () => {
    vi.mocked(browserMutate).mockResolvedValue({
      invitation: { id: "inv-2", email: "ops@forgebuilds.in" },
      emailSent: false,
    });

    const result = await createTeamInvitation({
      scope: "TEAM",
      email: "ops@forgebuilds.in",
      userRole: "OPERATIONS",
    });

    expect(result.emailSent).toBe(false);
  });

  it("keeps team query keys free of invitation tokens", () => {
    expect(JSON.stringify(teamKeys)).not.toMatch(/token/i);
    expect(teamKeys.members.all).toEqual(["team", "members"]);
  });
});

describe("parseCreateInvitationResult", () => {
  it("requires emailSent and strips token", () => {
    expect(
      parseCreateInvitationResult({
        invitation: { id: "inv-1", email: "a@forgebuilds.in" },
        emailSent: true,
        token: "secret",
      })
    ).toEqual({
      invitation: { id: "inv-1", email: "a@forgebuilds.in" },
      emailSent: true,
    });
  });

  it("rejects payloads missing emailSent", () => {
    expect(
      parseCreateInvitationResult({
        invitation: { id: "inv-1", email: "a@forgebuilds.in" },
      })
    ).toBeNull();
  });
});

import { InvitationScope, UserRole } from "@prisma/client";
import { InvitationsController } from "./invitations.controller";
import type { InvitationService } from "../services/invitation.service";
import type { AuthenticatedUser } from "../types/authenticated-request.interface";

const ACTOR: AuthenticatedUser = {
  id: "actor-id",
  organizationId: "org-id",
  role: UserRole.FOUNDER_ADMIN,
  email: "founder@forge.local",
  name: "Founder",
  active: true,
  onboardedAt: new Date(),
};

function makeController(exposeToken: boolean, invitationServiceOverrides: Partial<InvitationService> = {}) {
  const fakeInvitationService = {
    create: jest.fn().mockResolvedValue({
      invitation: { id: "invitation-id", scope: InvitationScope.TEAM, email: "invitee@forge.local" },
      rawToken: "raw-token-value-should-not-leak-in-production",
      emailSent: true,
    }),
    ...invitationServiceOverrides,
  } as unknown as InvitationService;
  const fakeConfig = {
    get: () => exposeToken,
  } as never;
  return { controller: new InvitationsController(fakeInvitationService, fakeConfig), fakeInvitationService };
}

describe("InvitationsController.create", () => {
  it("never returns the raw token when invitationExposeRawToken is false (production)", async () => {
    const { controller } = makeController(false);
    const response = await controller.create(ACTOR, {
      scope: InvitationScope.TEAM,
      email: "invitee@forge.local",
      userRole: "TEAM_MEMBER",
    } as never);

    expect(response).not.toHaveProperty("token");
    expect(JSON.stringify(response)).not.toContain("raw-token-value-should-not-leak-in-production");
  });

  it("still reports emailSent honestly when the token is withheld (production)", async () => {
    const { controller } = makeController(false, {
      create: jest.fn().mockResolvedValue({
        invitation: { id: "invitation-id" },
        rawToken: "irrelevant",
        emailSent: false,
      }),
    });

    const response = await controller.create(ACTOR, {
      scope: InvitationScope.TEAM,
      email: "invitee@forge.local",
      userRole: "TEAM_MEMBER",
    } as never);

    expect(response).toMatchObject({ emailSent: false });
  });

  it("returns the raw token when invitationExposeRawToken is true (non-production)", async () => {
    const { controller } = makeController(true);
    const response = await controller.create(ACTOR, {
      scope: InvitationScope.TEAM,
      email: "invitee@forge.local",
      userRole: "TEAM_MEMBER",
    } as never);

    expect(response).toMatchObject({ token: "raw-token-value-should-not-leak-in-production", emailSent: true });
  });
});

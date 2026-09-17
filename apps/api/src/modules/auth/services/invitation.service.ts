import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes, createHash } from "node:crypto";
import { InvitationScope, UserRole, type ClientUser, type User } from "@prisma/client";
import type { AppConfig } from "../../../config/configuration";
import { PrismaService } from "../../../database/prisma.service";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import { PasswordService } from "./password.service";
import type { AuthenticatedUser } from "../types/authenticated-request.interface";

export interface CreateInvitationInput {
  scope: InvitationScope;
  email: string;
  userRole?: UserRole;
  companyId?: string;
}

export interface AcceptInvitationResult {
  scope: InvitationScope;
  email: string;
}

export interface InvitationPreviewResult {
  email: string;
  role: UserRole;
  inviterName: string | null;
  organizationName: string;
}

/**
 * `InvitationToken` security (Step 6) — the raw token is generated,
 * returned to the caller exactly once (to email/hand to the invitee), and
 * never stored; only its SHA-256 hash is persisted, matching the
 * `token_hash` column (Document 2). SHA-256, not bcrypt: this token is a
 * 256-bit high-entropy random value, not a low-entropy human password —
 * hashing it for O(1) lookup is the goal, not slow, expensive stretching
 * (Document 6 §6.2 explicitly leaves the algorithm choice open: "must be
 * one-way... choose at implementation without claiming frozen algo").
 */
@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly passwordService: PasswordService,
    private readonly audit: AuditService
  ) {}

  /**
   * Document 6 §2.3: TEAM-scope invitations are FOUNDER_ADMIN-only
   * ("Users | C (invite) | ✓ FOUNDER_ADMIN | — | — | — | —"); CLIENT-scope
   * invitations may also be created by SALES ("Invitations | C/R/revoke |
   * ✓ | — | — | ✓⁷ | —", footnote 7: "portal.manage / sales invite
   * clients"). This is genuinely conditional on the request body's
   * `scope`, not expressible as a single static `@RequirePermissions(...)`
   * decorator — real "resource authorization" (Step 11), implemented here.
   */
  assertCanManageInvitations(actor: AuthenticatedUser, scope: InvitationScope): void {
    const allowed =
      actor.role === UserRole.FOUNDER_ADMIN ||
      (scope === InvitationScope.CLIENT && actor.role === UserRole.SALES);
    if (!allowed) {
      throw new ForbiddenException({
        code: "FORBIDDEN_PERMISSION",
        message: "You don't have permission to do this.",
      });
    }
  }

  async create(actor: AuthenticatedUser, input: CreateInvitationInput) {
    this.assertCanManageInvitations(actor, input.scope);

    if (input.scope === InvitationScope.TEAM && !input.userRole) {
      throw new BadRequestException({
        code: "INVITATION_USER_ROLE_REQUIRED",
        message: "A role is required for a team invitation.",
      });
    }
    if (input.scope === InvitationScope.CLIENT && !input.companyId) {
      throw new BadRequestException({
        code: "INVITATION_COMPANY_REQUIRED",
        message: "A company is required for a client invitation.",
      });
    }

    // B9 H5: company must belong to the caller's organization (Prisma FK alone is insufficient).
    if (input.scope === InvitationScope.CLIENT && input.companyId) {
      const company = await this.prisma.company.findFirst({
        where: { id: input.companyId, organization_id: actor.organizationId },
        select: { id: true },
      });
      if (!company) {
        throw new NotFoundException({
          code: "NOT_FOUND",
          message: "Company not found.",
        });
      }
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const ttlDays = this.config.get("auth.invitationTokenTtlDays", { infer: true });
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.invitationToken.create({
      data: {
        organization_id: actor.organizationId,
        token_hash: tokenHash,
        scope: input.scope,
        email: input.email,
        user_role: input.scope === InvitationScope.TEAM ? input.userRole : null,
        company_id: input.scope === InvitationScope.CLIENT ? input.companyId : null,
        expires_at: expiresAt,
        created_by: actor.id,
      },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.INVITATION_CREATED,
      entityType: "InvitationToken",
      entityId: invitation.id,
      after: { scope: invitation.scope, email: invitation.email },
    });

    // The raw token is returned exactly once, here — it is never
    // retrievable again (only its hash is persisted). Actually delivering
    // it by email (Resend, per Document 6 §20) is outside Phase 1's scope
    // (no domain/notification module exists yet); the caller is
    // responsible for transport until that exists.
    return { invitation, rawToken };
  }

  async get(actor: AuthenticatedUser, id: string) {
    const invitation = await this.prisma.invitationToken.findFirst({
      where: { id, organization_id: actor.organizationId },
    });
    if (!invitation) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Invitation not found." });
    }
    this.assertCanManageInvitations(actor, invitation.scope);
    return invitation;
  }

  /**
   * Public Gate preview — validates the raw token the same way accept does
   * (generic failure for missing/expired/used/revoked) but does **not**
   * consume `used_at`. TEAM-scope only: CLIENT invites are not part of the
   * internal onboarding Gate. Never returns `token_hash` or the raw token.
   */
  async preview(rawToken: string): Promise<InvitationPreviewResult> {
    const tokenHash = hashToken(rawToken);
    const invitation = await this.prisma.invitationToken.findUnique({
      where: { token_hash: tokenHash },
      include: {
        creator: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });

    const invalidReason = this.validateAcceptable(invitation);
    if (
      invalidReason ||
      !invitation ||
      invitation.scope !== InvitationScope.TEAM ||
      !invitation.user_role
    ) {
      throw new BadRequestException({
        code: "INVITATION_INVALID",
        message: "This invitation link is invalid or has expired.",
      });
    }

    return {
      email: invitation.email,
      role: invitation.user_role,
      inviterName: invitation.creator.name || null,
      organizationName: invitation.organization.name,
    };
  }

  async revoke(actor: AuthenticatedUser, id: string) {
    const invitation = await this.get(actor, id);

    if (invitation.revoked_at || invitation.used_at) {
      throw new ConflictException({
        code: "INVITATION_ALREADY_FINAL",
        message: "This invitation has already been used or revoked.",
      });
    }

    const revoked = await this.prisma.invitationToken.update({
      where: { id: invitation.id },
      data: { revoked_at: new Date() },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.INVITATION_REVOKED,
      entityType: "InvitationToken",
      entityId: invitation.id,
    });

    return revoked;
  }

  /**
   * Accept flow (Document 6 §6.2): lookup by hash → validate expiry/used/
   * revoked → create `User` (TEAM) or `ClientUser` (CLIENT) → set
   * `used_at`. All in one transaction, so a crash between "create the
   * identity" and "mark the token used" can't leave the token replayable
   * against a half-created account.
   *
   * Generic failure for every invalid case (Document 6 §6.2: "Invalid /
   * expired / used / revoked → generic failure (no enumeration of
   * which)") — a caller cannot distinguish "this token never existed"
   * from "it existed but already got used," which is exactly the
   * enumeration surface Document 6 closes off.
   */
  async accept(rawToken: string, password: string | undefined): Promise<AcceptInvitationResult> {
    const tokenHash = hashToken(rawToken);
    const invitation = await this.prisma.invitationToken.findUnique({
      where: { token_hash: tokenHash },
    });

    const invalidReason = this.validateAcceptable(invitation);
    if (invalidReason) {
      if (invitation) {
        await this.audit.record({
          organizationId: invitation.organization_id,
          actorType: "SYSTEM",
          actorId: null,
          action: AUDIT_ACTIONS.INVITATION_ACCEPT_REJECTED,
          entityType: "InvitationToken",
          entityId: invitation.id,
          after: { reason: invalidReason },
        });
      }
      throw new BadRequestException({
        code: "INVITATION_INVALID",
        message: "This invitation link is invalid or has expired.",
      });
    }

    // validateAcceptable already confirmed `invitation` is non-null.
    const valid = invitation!;
    const passwordHash = password ? await this.passwordService.hash(password) : null;

    const created: User | ClientUser = await this.prisma.$transaction(async (tx) => {
      const identity =
        valid.scope === InvitationScope.TEAM
          ? await tx.user.create({
              data: {
                organization_id: valid.organization_id,
                email: valid.email,
                name: valid.email, // Document 5/6 don't specify a name-collection
                // step in the accept payload — the invitee's display name isn't
                // part of the frozen InvitationToken shape; defaults to the
                // email address, editable later once a user-profile endpoint
                // exists (see the "Users | U" gap noted in shared/audit.service.ts).
                role: valid.user_role!,
                password_hash: passwordHash,
                active: true,
              },
            })
          : await tx.clientUser.create({
              data: {
                organization_id: valid.organization_id,
                company_id: valid.company_id!,
                email: valid.email,
                password_hash: passwordHash,
                active: true,
              },
            });

      await tx.invitationToken.update({
        where: { id: valid.id },
        data: { used_at: new Date() },
      });

      return identity;
    });

    await this.audit.record({
      organizationId: valid.organization_id,
      actorType: "USER",
      actorId: created.id,
      action: AUDIT_ACTIONS.INVITATION_ACCEPTED,
      entityType: "InvitationToken",
      entityId: valid.id,
      after: { scope: valid.scope, createdId: created.id },
    });

    return { scope: valid.scope, email: valid.email };
  }

  private validateAcceptable(
    invitation: {
      revoked_at: Date | null;
      used_at: Date | null;
      expires_at: Date;
    } | null
  ): string | null {
    if (!invitation) return "not_found";
    if (invitation.revoked_at) return "revoked";
    if (invitation.used_at) return "used";
    if (invitation.expires_at.getTime() < Date.now()) return "expired";
    return null;
  }
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

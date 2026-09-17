import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { PrismaService } from "../../../database/prisma.service";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import { OrganizationContextService } from "../../shared/organization-context.service";
import { CsrfService } from "./csrf.service";
import { PasswordService } from "./password.service";
import { SessionService } from "./session.service";
import type { Permission } from "../policies/permissions";
import { permissionsForRole } from "../policies/permissions";
import type { AuthenticatedUser } from "../types/authenticated-request.interface";

export interface SessionUserView {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  active: boolean;
  onboardedAt: string | null;
}

/** Generic — Document 6 §4.2's frozen requirement: "generic failure message." */
const GENERIC_LOGIN_ERROR = "Invalid email or password.";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationContext: OrganizationContextService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly csrfService: CsrfService,
    private readonly audit: AuditService
  ) {}

  async login(
    email: string,
    password: string,
    request: Request,
    response: Response
  ): Promise<SessionUserView> {
    const organizationId = await this.organizationContext.resolveSingleOrganizationId();

    // Organization-scoped lookup (Step 10) — `{ organization_id, email }`,
    // matching the actual unique constraint, not a bare email lookup.
    const user = await this.prisma.user.findUnique({
      where: { organization_id_email: { organization_id: organizationId, email } },
    });

    // Constant-shape failure for "no such user" and "wrong password" alike
    // (Document 6 §4.2/§5: generic message, no account enumeration). An
    // SSO-only user (`password_hash === null`) also fails here rather than
    // leaking "this account uses SSO" — that distinction is exactly the
    // kind of enumeration signal Document 6 asks not to expose.
    if (!user || !user.password_hash) {
      // Still pay bcrypt's time cost on a miss, so response timing doesn't
      // distinguish "no such user" from "user exists, wrong password."
      await this.passwordService.verify(password, await this.dummyHash());
      await this.recordFailedLogin(organizationId, null, request);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const passwordValid = await this.passwordService.verify(password, user.password_hash);
    if (!passwordValid) {
      await this.recordFailedLogin(organizationId, user.id, request);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    if (!user.active) {
      // Document 6 §4.2: "Inactive account | Deny login... generic failure
      // message" — deliberately the *same* message and status as a wrong
      // password, not a distinguishable "this account is disabled" (that
      // would itself be an enumeration/status leak).
      await this.audit.record({
        organizationId,
        actorType: "USER",
        actorId: user.id,
        action: AUDIT_ACTIONS.LOGIN_REJECTED_INACTIVE,
        entityType: "User",
        entityId: user.id,
        ipAddress: request.ip,
      });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    // Update `last_login_at` *before* minting the session token — see the
    // long comment in jwt-auth.guard.ts for why this ordering specifically
    // prevents a freshly-issued token from immediately invalidating itself
    // against its own `updated_at` bump.
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    const { token, expiresInSeconds } = this.sessionService.signSession({
      userId: updated.id,
      organizationId: updated.organization_id,
      role: updated.role,
    });
    this.sessionService.setSessionCookie(response, token, expiresInSeconds);
    this.csrfService.issueToken(response);

    await this.audit.record({
      organizationId,
      actorType: "USER",
      actorId: updated.id,
      action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
      entityType: "User",
      entityId: updated.id,
      ipAddress: request.ip,
    });

    return this.toSessionView(updated);
  }

  async logout(user: AuthenticatedUser | undefined, response: Response): Promise<void> {
    this.sessionService.clearSessionCookie(response);
    this.csrfService.clearToken(response);

    if (user) {
      // B9 H1: bump updated_at so any retained forge_session JWT fails the
      // security-stamp fence (matches portal logout / password-change behavior).
      await this.prisma.user.update({
        where: { id: user.id },
        data: { updated_at: new Date() },
      });

      await this.audit.record({
        organizationId: user.organizationId,
        actorType: "USER",
        actorId: user.id,
        action: AUDIT_ACTIONS.LOGOUT,
        entityType: "User",
        entityId: user.id,
      });
    }
  }

  session(user: AuthenticatedUser): SessionUserView {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      active: user.active,
      onboardedAt: user.onboardedAt ? user.onboardedAt.toISOString() : null,
    };
  }

  /**
   * Marks first-run onboarding complete. Idempotent: if `onboarded_at` is
   * already set, returns the current session view without writing.
   *
   * When a write occurs, `User.updated_at` bumps (Prisma `@updatedAt`) and
   * would invalidate the caller's JWT via the security-stamp fence — so this
   * method always re-issues `forge_session` after a successful first write.
   */
  async completeOnboarding(
    user: AuthenticatedUser,
    response: Response
  ): Promise<SessionUserView> {
    const existing = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!existing || !existing.active) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Authentication required.",
      });
    }
    if (existing.organization_id !== user.organizationId) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Authentication required.",
      });
    }

    if (existing.onboarded_at) {
      return this.toSessionView(existing);
    }

    const updated = await this.prisma.user.update({
      where: { id: existing.id },
      data: { onboarded_at: new Date() },
    });

    const { token, expiresInSeconds } = this.sessionService.signSession({
      userId: updated.id,
      organizationId: updated.organization_id,
      role: updated.role,
    });
    this.sessionService.setSessionCookie(response, token, expiresInSeconds);
    this.csrfService.issueToken(response);

    return this.toSessionView(updated);
  }

  permissions(user: AuthenticatedUser): Permission[] {
    return permissionsForRole(user.role);
  }

  private toSessionView(user: {
    id: string;
    email: string;
    name: string;
    role: string;
    organization_id: string;
    active: boolean;
    onboarded_at: Date | null;
  }): SessionUserView {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organization_id,
      active: user.active,
      onboardedAt: user.onboarded_at ? user.onboarded_at.toISOString() : null,
    };
  }

  private async recordFailedLogin(
    organizationId: string,
    userId: string | null,
    request: Request
  ): Promise<void> {
    await this.audit.record({
      organizationId,
      actorType: userId ? "USER" : "SYSTEM",
      actorId: userId,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: "User",
      // AuditLog.entity_id is a required UUID (Document 2) — for an
      // unknown-email attempt there is no real User row to reference, so
      // this uses a fixed nil UUID rather than fabricating one. The
      // `action`/`before` fields still make the event fully meaningful.
      entityId: userId ?? NIL_UUID,
      ipAddress: request.ip,
    });
  }

  private dummyHashPromise: Promise<string> | undefined;

  /** A real bcrypt hash (of a value nobody will ever type), generated once
   * and cached, so a login attempt against a non-existent email still
   * pays the same bcrypt time cost — and at the *actually configured*
   * cost factor, not a hand-typed guess — as a real verification would.
   * See the timing-safety comment in `login()` above. */
  private dummyHash(): Promise<string> {
    if (!this.dummyHashPromise) {
      this.dummyHashPromise = this.passwordService.hash(
        "forge-business-os-constant-time-comparison-placeholder"
      );
    }
    return this.dummyHashPromise;
  }
}

/** RFC 4122 nil UUID — used only as the `entity_id` placeholder for a
 * failed-login audit event against an email with no matching User row. */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

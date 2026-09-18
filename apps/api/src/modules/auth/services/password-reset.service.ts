import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../../config/configuration";
import { resolveWebAppOrigin } from "../../../common/http/web-app-origin";
import { PrismaService } from "../../../database/prisma.service";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import { EmailService } from "../../shared/email/services/email.service";
import { buildPasswordResetEmail } from "../../shared/email/templates/password-reset-email";
import { OrganizationContextService } from "../../shared/organization-context.service";
import { PasswordService } from "./password.service";
import { SessionService } from "./session.service";

/**
 * Password reset (Step 7), within a hard frozen-schema constraint:
 * Document 6 §7 confirms **no `PasswordResetToken` table exists** ("no
 * PasswordResetToken entity in schema — implementation may use signed
 * token or ephemeral store without claiming a new frozen table; do not
 * add Prisma model in this doc"). This is not a conflict requiring a
 * schema change — Document 6 already sanctions the alternative used here:
 *
 *   - The reset token is a signed JWT (`SessionService.signPasswordResetToken`,
 *     `aud: internal-password-reset`), NOT persisted anywhere. Its
 *     "hashed persistence" is replaced by cryptographic signing — nobody
 *     can forge one without the server's signing key, which is the
 *     property `token_hash` storage would otherwise have provided.
 *   - "Single-use" (Step 7 explicit requirement) is enforced without a
 *     database row to mark "used": the same security-stamp fence
 *     `JwtAuthGuard` uses for session invalidation — `token.iat` compared
 *     against `User.updated_at` — makes a reset token unusable a second
 *     time, because completing a reset updates `password_hash`, which
 *     bumps `updated_at` past the token's `iat`. A replay of the same
 *     token after a successful reset is therefore rejected by the exact
 *     same mechanism, not a separate one.
 *
 * See `docs/IMPLEMENTATION-PHASE-1.md` for this reasoning stated in full;
 * it's repeated here because it's the load-bearing design decision this
 * whole service rests on.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationContext: OrganizationContextService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly emailService: EmailService
  ) {}

  /**
   * Always succeeds from the caller's point of view (Document 6 §7:
   * "Never reveal whether an email exists" / "Generic responses"). If a
   * matching, active user exists, a token is minted — but the *response*
   * never differs, and the token itself is never returned to the HTTP
   * caller (only logged/would-be-emailed) so a script probing this
   * endpoint can't distinguish a hit from a miss by response shape,
   * timing class, or body content.
   */
  async request(email: string): Promise<void> {
    const organizationId = await this.organizationContext.resolveSingleOrganizationId();
    const user = await this.prisma.user.findUnique({
      where: { organization_id_email: { organization_id: organizationId, email } },
    });

    if (!user || !user.active) {
      return;
    }

    const token = this.sessionService.signPasswordResetToken(user.id);

    await this.audit.record({
      organizationId,
      actorType: "USER",
      actorId: user.id,
      action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
      entityType: "User",
      entityId: user.id,
    });

    // `token` is never returned in the HTTP response or logged anywhere —
    // it only ever leaves this method embedded in the reset URL passed
    // straight to EmailService (F10.3). The response contract below is
    // unchanged regardless of delivery outcome (anti-enumeration, Document
    // 6 §7): this method still always resolves the same way for both a
    // real and an unknown email, so a caller can never distinguish "no such
    // account" from "account exists but the reset email failed to send."
    const ttlSeconds = this.config.get("auth.passwordResetTokenTtlSeconds", { infer: true });
    const resetUrl = `${resolveWebAppOrigin(this.config.get("cors.origins", { infer: true }))}/reset-password?token=${token}`;
    const renderedEmail = buildPasswordResetEmail({
      resetUrl,
      expiresInMinutes: Math.max(1, Math.round(ttlSeconds / 60)),
    });
    const sendResult = await this.emailService.send({
      to: user.email,
      subject: renderedEmail.subject,
      html: renderedEmail.html,
      text: renderedEmail.text,
    });

    if (!sendResult.sent) {
      await this.audit.record({
        organizationId,
        actorType: "SYSTEM",
        actorId: user.id,
        action: AUDIT_ACTIONS.PASSWORD_RESET_EMAIL_FAILED,
        entityType: "User",
        entityId: user.id,
        after: { reason: sendResult.reason },
      });
    }
  }

  async confirm(rawToken: string, newPassword: string): Promise<void> {
    // Throws UnauthorizedException on a malformed/expired/wrong-audience
    // token — that failure is intentionally distinguishable from "token
    // was valid but already used" below, matching Document 6 §7's
    // "single-use" and "expiry" as related-but-separate failure modes
    // (unlike login/invitation-accept, §7 doesn't ask for these to be
    // indistinguishable from each other, only that email existence never
    // be revealed — which a reset token, tied to a specific user by
    // construction, cannot leak either way).
    const payload = this.sessionService.verifyPasswordResetToken(rawToken);

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) {
      throw new UnauthorizedException({
        code: "PASSWORD_RESET_TOKEN_INVALID",
        message: "This password reset link is invalid or has expired.",
      });
    }

    // Millisecond-precision comparison — see the long explanation in
    // jwt-auth.guard.ts for why `iatMs` (a custom claim) is used instead
    // of the standard second-precision JWT `iat`.
    if (payload.iatMs < user.updated_at.getTime()) {
      await this.audit.record({
        organizationId: user.organization_id,
        actorType: "USER",
        actorId: user.id,
        action: AUDIT_ACTIONS.PASSWORD_RESET_REPLAY_REJECTED,
        entityType: "User",
        entityId: user.id,
      });
      throw new UnauthorizedException({
        code: "PASSWORD_RESET_TOKEN_INVALID",
        message: "This password reset link is invalid or has expired.",
      });
    }

    const passwordHash = await this.passwordService.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password_hash: passwordHash },
    });

    // Updating `password_hash` just bumped `updated_at` — every session
    // issued before this instant (including this very reset token, if
    // somehow replayed) now fails the security-stamp fence in
    // `JwtAuthGuard`/this method's own check above. That *is* "invalidate
    // all existing sessions for that user" (Document 6 §5.3) — there is
    // no separate revocation step to perform.

    await this.audit.record({
      organizationId: user.organization_id,
      actorType: "USER",
      actorId: user.id,
      action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
      entityType: "User",
      entityId: user.id,
    });
  }
}

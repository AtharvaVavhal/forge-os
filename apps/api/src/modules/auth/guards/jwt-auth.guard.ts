import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../../database/prisma.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { SessionService, SESSION_COOKIE_NAME } from "../services/session.service";
import type { AuthenticatedRequest } from "../types/authenticated-request.interface";

const UNAUTHENTICATED = {
  code: "UNAUTHENTICATED",
  message: "Authentication required.",
} as const;

/**
 * The `Request → Authentication → User → Session → Organization Context`
 * chain from Step 8, as a global guard (fail-closed: every route requires
 * a valid session unless explicitly marked `@Public()` — the opt-out is
 * the exception, not the default).
 *
 * Verifying the JWT signature is necessary but not sufficient. Two more
 * checks happen against the *live* `User` row on every single request,
 * because there is no Session table to revoke against (Document 6 §5.2
 * item 3) — these two checks are the entire "session invalidation"
 * mechanism this codebase has:
 *
 *   1. `User.active === true` — Document 6 §5.3: "Internal User.active=false
 *      → reject authenticated requests." A deactivated user's existing,
 *      unexpired JWTs stop working on their very next request.
 *
 *   2. `token.iatMs >= User.updated_at` — the "security stamp" fence.
 *      `updated_at` bumps automatically (`@updatedAt`) on ANY write to the
 *      user row, including a password change. Document 6 §5.3 requires
 *      "Password change/reset → invalidate all existing sessions for that
 *      user" — with no revocation store, comparing the token's issue time
 *      against the row's last-modified time is the mechanism: a token
 *      issued before the most recent change is stale and rejected. This
 *      is deliberately conservative — it also invalidates sessions on an
 *      unrelated profile edit (e.g. a name change), which is a safe-
 *      direction side effect (over-invalidating is a UX cost, never a
 *      security hole), not an oversight. It also means a role change
 *      forces re-authentication, which Document 6 §5.2 separately lists
 *      as "recommended... not explicitly frozen" — this fence delivers
 *      that recommendation as a natural consequence, not a separate
 *      mechanism.
 *
 *      The comparison uses `iatMs`, a custom millisecond-precision claim
 *      (see jwt-payload.interface.ts) — NOT the standard JWT `iat`, which
 *      is fixed at whole-second resolution by RFC 7519. A whole-second
 *      comparison cannot reliably tell "token issued before this update"
 *      apart from "issued in the same second as this update," which
 *      matters a great deal here: a session token is routinely minted in
 *      the same request that just bumped `last_login_at` (see
 *      auth.service.ts), so token-mint and a legitimate user-row write
 *      are often within the same wall-clock second. `iatMs` vs.
 *      `updated_at.getTime()` (both millisecond-precision) removes the
 *      ambiguity entirely. This was a real bug caught by e2e testing in
 *      Phase 1, not a hypothetical — see docs/IMPLEMENTATION-PHASE-1.md.
 *
 * This resolves Document 6 §5.2/§26's open "session storage mechanism"
 * question in the only direction the frozen schema allows (JWT-only, no
 * server-side store) — not a free design choice made in isolation.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[SESSION_COOKIE_NAME];

    if (!token) {
      throw new UnauthorizedException(UNAUTHENTICATED);
    }

    const payload = this.sessionService.verifySession(token);

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException(UNAUTHENTICATED);
    }
    if (!user.active) {
      throw new UnauthorizedException(UNAUTHENTICATED);
    }
    // Cross-org token/user integrity check (Step 10/20): a token whose
    // `org` claim doesn't match the user row it actually names is either
    // forged or stale from a since-changed organization assignment —
    // either way, never trust the claim over the live row.
    if (user.organization_id !== payload.org) {
      throw new UnauthorizedException(UNAUTHENTICATED);
    }
    // Security-stamp fence — see class doc above for why this compares
    // millisecond-precision values, not the standard second-precision `iat`.
    if (payload.iatMs < user.updated_at.getTime()) {
      throw new UnauthorizedException({
        code: "SESSION_STALE",
        message: "Session is no longer valid — please sign in again.",
      });
    }

    request.user = {
      id: user.id,
      organizationId: user.organization_id,
      role: user.role,
      email: user.email,
      name: user.name,
    };

    return true;
  }
}

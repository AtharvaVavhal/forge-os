import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { CsrfService, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../services/csrf.service";
import type { AuthenticatedRequest } from "../types/authenticated-request.interface";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Step 12 — real CSRF token validation for cookie-authenticated,
 * state-changing requests. Runs after `JwtAuthGuard` in registration
 * order, so it only ever evaluates already-authenticated requests.
 *
 * Scope, deliberately:
 *   - Safe methods (GET/HEAD/OPTIONS) are exempt — CSRF concerns
 *     state-changing actions, not reads.
 *   - `@Public()` routes are exempt — login, Google SSO, invitation
 *     accept, and password-reset request/confirm have no established
 *     cookie session yet for a forged request to ride on; CSRF defends
 *     an *existing* authenticated session, not the act of creating one.
 *   - Every other mutating route requires a matching `X-CSRF-Token`
 *     header (double-submit against the `forge_csrf` cookie, Step 12
 *     explicit requirement — `SameSite=Strict` alone is not treated as
 *     sufficient, even though it already blocks cross-site cookie
 *     attachment in compliant browsers; this is real defense-in-depth,
 *     not a redundant no-op).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly csrfService: CsrfService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (SAFE_METHODS.has(request.method)) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const cookieToken = cookies?.[CSRF_COOKIE_NAME];
    const headerToken = request.headers[CSRF_HEADER_NAME];
    const headerValue = Array.isArray(headerToken) ? headerToken[0] : headerToken;

    if (!this.csrfService.matches(cookieToken, headerValue)) {
      throw new ForbiddenException({
        code: "CSRF_TOKEN_INVALID",
        message: "This request could not be verified. Please refresh and try again.",
      });
    }

    return true;
  }
}

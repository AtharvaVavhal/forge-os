import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a route as reachable without a `forge_session` cookie — login,
 * logout is NOT public (it needs a session to invalidate), Google SSO
 * start/callback, invitation accept, password-reset request/confirm, and
 * the Phase 0 health endpoints. Every other route requires authentication
 * by default (fail-closed): `JwtAuthGuard` is registered globally, and a
 * route is only exempt if it explicitly opts out with this decorator —
 * never the other way around.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

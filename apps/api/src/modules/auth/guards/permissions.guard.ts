import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRED_PERMISSIONS_KEY } from "../decorators/require-permissions.decorator";
import { roleHasPermission, type Permission } from "../policies/permissions";
import type { AuthenticatedRequest } from "../types/authenticated-request.interface";

/**
 * RBAC enforcement (Step 9) — runs after `JwtAuthGuard` (registration
 * order in auth.module.ts), so `request.user` is always populated here.
 * A route with no `@RequirePermissions(...)` metadata passes through
 * unconditionally (authentication alone is the requirement); a route
 * with permissions declared requires the current user's role to grant
 * at least one of them (FOUNDER_ADMIN's `'*'` wildcard always passes).
 *
 * Consistent 403 behavior: every denial uses the same frozen-envelope-
 * compatible `ForbiddenException` with a stable `code`, never a bespoke
 * message per call site.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      // JwtAuthGuard should already have rejected an unauthenticated
      // request before this guard runs — this is a defensive fallback,
      // not the primary enforcement path.
      throw new ForbiddenException({
        code: "FORBIDDEN_PERMISSION",
        message: "You don't have permission to do this.",
      });
    }

    const allowed = required.some((permission) => roleHasPermission(user.role, permission));
    if (!allowed) {
      throw new ForbiddenException({
        code: "FORBIDDEN_PERMISSION",
        message: "You don't have permission to do this.",
      });
    }

    return true;
  }
}

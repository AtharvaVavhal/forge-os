import { SetMetadata } from "@nestjs/common";
import type { Permission } from "../policies/permissions";

export const REQUIRED_PERMISSIONS_KEY = "requiredPermissions";

/**
 * `@RequirePermissions('finance.manage')` — checked by `PermissionsGuard`
 * against the current user's role (Document 5 §4.3's matrix). A route
 * with no `@RequirePermissions(...)` still requires *authentication*
 * (via `JwtAuthGuard`, on by default) but no specific permission — that's
 * the correct default for routes like `/auth/me` that any authenticated
 * user may call.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

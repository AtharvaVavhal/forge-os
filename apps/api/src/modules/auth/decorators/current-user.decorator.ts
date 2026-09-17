import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import type { AuthenticatedRequest, AuthenticatedUser } from "../types/authenticated-request.interface";

/** Usage: `handler(@CurrentUser() user: AuthenticatedUser)`. Only valid
 * behind `JwtAuthGuard` (unset on `@Public()` routes). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  }
);

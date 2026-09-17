import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import type {
  AuthenticatedPortalRequest,
  AuthenticatedPortalUser,
} from "../types/authenticated-portal-request.interface";

/** Usage: `handler(@CurrentPortalUser() client: AuthenticatedPortalUser)`. */
export const CurrentPortalUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedPortalUser | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedPortalRequest>();
    return request.portalUser;
  }
);

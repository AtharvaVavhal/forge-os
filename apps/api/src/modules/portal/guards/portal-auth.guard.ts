import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { isPortalHttpPath } from "../../../common/http/is-portal-path";
import { PrismaService } from "../../../database/prisma.service";
import { IS_PUBLIC_KEY } from "../../auth/decorators/public.decorator";
import {
  PortalSessionService,
  PORTAL_SESSION_COOKIE_NAME,
} from "../services/portal-session.service";
import type { AuthenticatedPortalRequest } from "../types/authenticated-portal-request.interface";

const UNAUTHENTICATED = {
  code: "UNAUTHENTICATED",
  message: "Authentication required.",
} as const;

/**
 * Portal authentication plane (Document 6 §9.1).
 *
 * Applies only to `/api/v1/portal/*`. Non-portal routes pass through.
 * `@Public()` portal routes (login) also pass through.
 *
 * Live checks on every authenticated portal request:
 * 1. Valid `portal_session` with `aud: portal`
 * 2. ClientUser exists, org matches, company matches claim, active
 * 3. Security stamp: `iatMs >= ClientUser.updated_at`
 */
@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly portalSession: PortalSessionService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedPortalRequest>();

    if (!isPortalHttpPath(request)) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[PORTAL_SESSION_COOKIE_NAME];
    if (!token) {
      throw new UnauthorizedException(UNAUTHENTICATED);
    }

    const payload = this.portalSession.verifySession(token);

    const clientUser = await this.prisma.clientUser.findUnique({ where: { id: payload.sub } });
    if (!clientUser) {
      throw new UnauthorizedException(UNAUTHENTICATED);
    }
    if (!clientUser.active) {
      throw new UnauthorizedException(UNAUTHENTICATED);
    }
    if (clientUser.organization_id !== payload.org) {
      throw new UnauthorizedException(UNAUTHENTICATED);
    }
    if (clientUser.company_id !== payload.companyId) {
      throw new UnauthorizedException(UNAUTHENTICATED);
    }
    if (payload.iatMs < clientUser.updated_at.getTime()) {
      throw new UnauthorizedException({
        code: "SESSION_STALE",
        message: "Session is no longer valid — please sign in again.",
      });
    }

    request.portalUser = {
      id: clientUser.id,
      organizationId: clientUser.organization_id,
      companyId: clientUser.company_id,
      email: clientUser.email,
      contactId: clientUser.contact_id,
    };

    return true;
  }
}

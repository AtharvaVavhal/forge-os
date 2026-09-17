import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { PrismaService } from "../../../database/prisma.service";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import { OrganizationContextService } from "../../shared/organization-context.service";
import { CsrfService } from "../../auth/services/csrf.service";
import { PasswordService } from "../../auth/services/password.service";
import { PortalSessionService } from "./portal-session.service";
import type { AuthenticatedPortalUser } from "../types/authenticated-portal-request.interface";

export interface PortalSessionUserView {
  id: string;
  email: string;
  organizationId: string;
  companyId: string;
  contactId: string | null;
  active: boolean;
}

const GENERIC_LOGIN_ERROR = "Invalid email or password.";
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

@Injectable()
export class PortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationContext: OrganizationContextService,
    private readonly passwordService: PasswordService,
    private readonly portalSession: PortalSessionService,
    private readonly csrfService: CsrfService,
    private readonly audit: AuditService
  ) {}

  async login(
    email: string,
    password: string,
    request: Request,
    response: Response
  ): Promise<PortalSessionUserView> {
    const organizationId = await this.organizationContext.resolveSingleOrganizationId();

    const clientUser = await this.prisma.clientUser.findUnique({
      where: { organization_id_email: { organization_id: organizationId, email } },
    });

    if (!clientUser || !clientUser.password_hash) {
      await this.passwordService.verify(password, await this.dummyHash());
      await this.recordFailedLogin(organizationId, null, request);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const passwordValid = await this.passwordService.verify(password, clientUser.password_hash);
    if (!passwordValid) {
      await this.recordFailedLogin(organizationId, clientUser.id, request);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    if (!clientUser.active) {
      await this.audit.record({
        organizationId,
        actorType: "CLIENT_USER",
        actorId: clientUser.id,
        action: AUDIT_ACTIONS.PORTAL_LOGIN_REJECTED_INACTIVE,
        entityType: "ClientUser",
        entityId: clientUser.id,
        ipAddress: request.ip,
      });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    await this.prisma.clientUser.update({
      where: { id: clientUser.id },
      data: { last_login_at: new Date() },
    });

    const { token, expiresInSeconds } = this.portalSession.signSession({
      clientUserId: clientUser.id,
      organizationId: clientUser.organization_id,
      companyId: clientUser.company_id,
    });
    this.portalSession.setSessionCookie(response, token, expiresInSeconds);
    this.csrfService.issueToken(response);

    await this.audit.record({
      organizationId,
      actorType: "CLIENT_USER",
      actorId: clientUser.id,
      action: AUDIT_ACTIONS.PORTAL_LOGIN_SUCCEEDED,
      entityType: "ClientUser",
      entityId: clientUser.id,
      ipAddress: request.ip,
    });

    return {
      id: clientUser.id,
      email: clientUser.email,
      organizationId: clientUser.organization_id,
      companyId: clientUser.company_id,
      contactId: clientUser.contact_id,
      active: clientUser.active,
    };
  }

  async logout(client: AuthenticatedPortalUser | undefined, response: Response): Promise<void> {
    this.portalSession.clearSessionCookie(response);
    this.csrfService.clearToken(response);

    if (client) {
      // Bump updated_at so any retained JWT fails the security-stamp fence
      // on the next request (same invalidation pattern as password change).
      await this.prisma.clientUser.update({
        where: { id: client.id },
        data: { updated_at: new Date() },
      });

      await this.audit.record({
        organizationId: client.organizationId,
        actorType: "CLIENT_USER",
        actorId: client.id,
        action: AUDIT_ACTIONS.PORTAL_LOGOUT,
        entityType: "ClientUser",
        entityId: client.id,
      });
    }
  }

  me(client: AuthenticatedPortalUser): PortalSessionUserView {
    return {
      id: client.id,
      email: client.email,
      organizationId: client.organizationId,
      companyId: client.companyId,
      contactId: client.contactId,
      active: true,
    };
  }

  private async recordFailedLogin(
    organizationId: string,
    clientUserId: string | null,
    request: Request
  ): Promise<void> {
    await this.audit.record({
      organizationId,
      actorType: clientUserId ? "CLIENT_USER" : "SYSTEM",
      actorId: clientUserId,
      action: AUDIT_ACTIONS.PORTAL_LOGIN_FAILED,
      entityType: "ClientUser",
      entityId: clientUserId ?? NIL_UUID,
      ipAddress: request.ip,
    });
  }

  private dummyHashPromise: Promise<string> | undefined;

  private dummyHash(): Promise<string> {
    if (!this.dummyHashPromise) {
      this.dummyHashPromise = this.passwordService.hash("portal-dummy-password-never-used");
    }
    return this.dummyHashPromise;
  }
}

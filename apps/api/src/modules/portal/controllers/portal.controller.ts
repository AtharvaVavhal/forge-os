import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, UseInterceptors } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { NoStoreCacheInterceptor } from "../../../common/interceptors/no-store-cache.interceptor";
import { Public } from "../../auth/decorators/public.decorator";
import { CurrentPortalUser } from "../decorators/current-portal-user.decorator";
import { PortalLoginDto, PortalListQueryDto, CreatePortalSupportTicketDto } from "../dto/portal.dto";
import { portalLoginThrottle, portalSupportTicketThrottle } from "../rate-limits";
import { PortalAuthService } from "../services/portal-auth.service";
import { PortalProjectsService } from "../services/portal-projects.service";
import { PortalProposalsService } from "../services/portal-proposals.service";
import { PortalInvoicesService } from "../services/portal-invoices.service";
import { PortalDocumentsService } from "../services/portal-documents.service";
import { PortalSupportService } from "../services/portal-support.service";
import type { AuthenticatedPortalUser } from "../types/authenticated-portal-request.interface";

/**
 * Document 5 §11 / §19 — exactly the frozen 16 portal routes.
 * Auth plane: `portal_session` / `aud: portal` via PortalAuthGuard.
 */
@Controller("portal")
export class PortalController {
  constructor(
    private readonly auth: PortalAuthService,
    private readonly projects: PortalProjectsService,
    private readonly proposals: PortalProposalsService,
    private readonly invoices: PortalInvoicesService,
    private readonly documents: PortalDocumentsService,
    private readonly support: PortalSupportService
  ) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  @Public()
  @Throttle(portalLoginThrottle())
  @HttpCode(200)
  @Post("auth/login")
  login(
    @Body() dto: PortalLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.auth.login(dto.email, dto.password, request, response);
  }

  @HttpCode(204)
  @Post("auth/logout")
  async logout(
    @CurrentPortalUser() client: AuthenticatedPortalUser | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    await this.auth.logout(client, response);
  }

  @UseInterceptors(NoStoreCacheInterceptor)
  @Get("me")
  me(@CurrentPortalUser() client: AuthenticatedPortalUser) {
    return this.auth.me(client);
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  @Get("projects")
  listProjects(
    @CurrentPortalUser() client: AuthenticatedPortalUser,
    @Query() query: PortalListQueryDto
  ) {
    return this.projects.list(client, query);
  }

  @Get("projects/:id")
  getProject(
    @CurrentPortalUser() client: AuthenticatedPortalUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.projects.get(client, id);
  }

  @Get("projects/:id/milestones")
  listMilestones(
    @CurrentPortalUser() client: AuthenticatedPortalUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.projects.listMilestones(client, id);
  }

  @Get("projects/:id/handover")
  getHandover(
    @CurrentPortalUser() client: AuthenticatedPortalUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.projects.getHandover(client, id);
  }

  // ── Proposals ─────────────────────────────────────────────────────────────

  @Get("proposals")
  listProposals(
    @CurrentPortalUser() client: AuthenticatedPortalUser,
    @Query() query: PortalListQueryDto
  ) {
    return this.proposals.list(client, query);
  }

  @Get("proposals/:id")
  getProposal(
    @CurrentPortalUser() client: AuthenticatedPortalUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.proposals.get(client, id);
  }

  @HttpCode(200)
  @Post("proposals/:id/accept")
  acceptProposal(
    @CurrentPortalUser() client: AuthenticatedPortalUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.proposals.accept(client, id);
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  @Get("invoices")
  listInvoices(
    @CurrentPortalUser() client: AuthenticatedPortalUser,
    @Query() query: PortalListQueryDto
  ) {
    return this.invoices.list(client, query);
  }

  @Get("invoices/:id")
  getInvoice(
    @CurrentPortalUser() client: AuthenticatedPortalUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.invoices.get(client, id);
  }

  @HttpCode(200)
  @Post("invoices/:id/pay")
  payInvoice(
    @CurrentPortalUser() client: AuthenticatedPortalUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.invoices.pay(client, id);
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  @Get("documents")
  listDocuments(
    @CurrentPortalUser() client: AuthenticatedPortalUser,
    @Query() query: PortalListQueryDto
  ) {
    return this.documents.list(client, query);
  }

  @Get("documents/:id/download-url")
  downloadDocument(
    @CurrentPortalUser() client: AuthenticatedPortalUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.documents.downloadUrl(client, id);
  }

  // ── Support ───────────────────────────────────────────────────────────────

  @Get("support-tickets")
  listSupportTickets(
    @CurrentPortalUser() client: AuthenticatedPortalUser,
    @Query() query: PortalListQueryDto
  ) {
    return this.support.list(client, query);
  }

  @Throttle(portalSupportTicketThrottle())
  @HttpCode(201)
  @Post("support-tickets")
  createSupportTicket(
    @CurrentPortalUser() client: AuthenticatedPortalUser,
    @Body() dto: CreatePortalSupportTicketDto
  ) {
    return this.support.create(client, {
      projectId: dto.projectId,
      subject: dto.subject,
    });
  }
}

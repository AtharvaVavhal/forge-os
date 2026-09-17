import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../decorators/current-user.decorator";
import { Public } from "../decorators/public.decorator";
import { AcceptInvitationDto } from "../dto/accept-invitation.dto";
import { CreateInvitationDto } from "../dto/create-invitation.dto";
import { InvitationService } from "../services/invitation.service";
import type { AuthenticatedUser } from "../types/authenticated-request.interface";
import { invitationAcceptThrottle } from "../rate-limits";

/**
 * Document 5 §3.2: `/invitations*`, not nested under `/auth` — the
 * accept endpoint is the sole public route here; create/get/revoke all
 * require authentication, with the actual TEAM-vs-CLIENT permission
 * split enforced inside `InvitationService.assertCanManageInvitations`
 * (Document 6 §2.3 — conditional on the invitation's `scope`, not a
 * single static permission).
 */
@Controller("invitations")
export class InvitationsController {
  constructor(private readonly invitationService: InvitationService) {}

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInvitationDto) {
    const { invitation, rawToken } = await this.invitationService.create(user, {
      scope: dto.scope,
      email: dto.email,
      userRole: dto.userRole,
      companyId: dto.companyId,
    });
    // The raw token is surfaced in this response for Phase 1 (no email-
    // delivery module exists yet to hand it off to instead) — a real
    // deployment replaces this with an email send and stops returning it
    // over HTTP. Documented explicitly as a Phase 1 limitation, not an
    // oversight (see docs/IMPLEMENTATION-PHASE-1.md).
    return { invitation, token: rawToken };
  }

  @Get(":id")
  async get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.invitationService.get(user, id);
  }

  @HttpCode(204)
  @Post(":id/revoke")
  async revoke(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    await this.invitationService.revoke(user, id);
  }

  @Public()
  @Throttle(invitationAcceptThrottle())
  @HttpCode(200)
  @Post("accept")
  async accept(@Body() dto: AcceptInvitationDto) {
    return this.invitationService.accept(dto.token, dto.password);
  }
}

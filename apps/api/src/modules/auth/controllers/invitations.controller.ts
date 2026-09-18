import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { AppConfig } from "../../../config/configuration";
import { CurrentUser } from "../decorators/current-user.decorator";
import { Public } from "../decorators/public.decorator";
import { AcceptInvitationDto } from "../dto/accept-invitation.dto";
import { CreateInvitationDto } from "../dto/create-invitation.dto";
import { PreviewInvitationDto } from "../dto/preview-invitation.dto";
import { InvitationService } from "../services/invitation.service";
import type { AuthenticatedUser } from "../types/authenticated-request.interface";
import { invitationAcceptThrottle } from "../rate-limits";

/**
 * Document 5 §3.2: `/invitations*`, not nested under `/auth` — public
 * routes are accept + preview; create/get/revoke require authentication,
 * with the actual TEAM-vs-CLIENT permission split enforced inside
 * `InvitationService.assertCanManageInvitations` (Document 6 §2.3 —
 * conditional on the invitation's `scope`, not a single static permission).
 */
@Controller("invitations")
export class InvitationsController {
  constructor(
    private readonly invitationService: InvitationService,
    private readonly config: ConfigService<AppConfig, true>
  ) {}

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInvitationDto) {
    const { invitation, rawToken, emailSent } = await this.invitationService.create(user, {
      scope: dto.scope,
      email: dto.email,
      userRole: dto.userRole,
      companyId: dto.companyId,
    });
    // B9 H2: never return the raw token in production. Non-production keeps
    // returning it so local/e2e flows can accept invitations independently
    // of email delivery (e.g. when Resend isn't configured in that
    // environment). `emailSent` is always reported honestly either way
    // (F10.3) — it is never inferred/assumed true.
    const exposeToken = this.config.get("auth.invitationExposeRawToken", { infer: true });
    if (!exposeToken) {
      return { invitation, emailSent };
    }
    return { invitation, token: rawToken, emailSent };
  }

  @Get(":id")
  async get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.invitationService.get(user, id);
  }

  @HttpCode(204)
  @Post(":id/revoke")
  async revoke(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.invitationService.revoke(user, id);
  }

  @Public()
  @Throttle(invitationAcceptThrottle())
  @HttpCode(200)
  @Post("preview")
  async preview(@Body() dto: PreviewInvitationDto) {
    return this.invitationService.preview(dto.token);
  }

  @Public()
  @Throttle(invitationAcceptThrottle())
  @HttpCode(200)
  @Post("accept")
  async accept(@Body() dto: AcceptInvitationDto) {
    return this.invitationService.accept(dto.token, dto.password);
  }
}

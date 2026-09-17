import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, UnauthorizedException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { PrismaService } from "../../../database/prisma.service";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import { OrganizationContextService } from "../../shared/organization-context.service";
import { CurrentUser } from "../decorators/current-user.decorator";
import { Public } from "../decorators/public.decorator";
import { LoginDto } from "../dto/login.dto";
import { ConfirmPasswordResetDto, RequestPasswordResetDto } from "../dto/password-reset.dto";
import { AuthService } from "../services/auth.service";
import { CsrfService } from "../services/csrf.service";
import { GOOGLE_OAUTH_STATE_COOKIE, GoogleSsoService } from "../services/google-sso.service";
import { PasswordResetService } from "../services/password-reset.service";
import { SessionService } from "../services/session.service";
import type { AuthenticatedUser } from "../types/authenticated-request.interface";
import { loginThrottle, passwordResetThrottle } from "../rate-limits";

/**
 * Exactly Document 5 §3.2's auth endpoint table — no business endpoints
 * (Step 16). Every route below traces to one row of that table. Invitation
 * routes live in `InvitationsController` instead — Document 5 places them
 * at `/invitations*`, not nested under `/auth`, even though Document 6
 * groups "auth" and "invitations" conceptually in the same module.
 */
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly googleSsoService: GoogleSsoService,
    private readonly sessionService: SessionService,
    private readonly csrfService: CsrfService,
    private readonly prisma: PrismaService,
    private readonly organizationContext: OrganizationContextService,
    private readonly audit: AuditService
  ) {}

  @Public()
  @Throttle(loginThrottle())
  @HttpCode(200)
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.authService.login(dto.email, dto.password, request, response);
  }

  @HttpCode(204)
  @Post("logout")
  async logout(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    await this.authService.logout(user, response);
  }

  @Get("session")
  session(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.session(user);
  }

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.session(user);
  }

  @Get("permissions")
  permissions(@CurrentUser() user: AuthenticatedUser) {
    return { permissions: this.authService.permissions(user) };
  }

  @Public()
  @Get("google/start")
  googleStart(@Res() response: Response) {
    const url = this.googleSsoService.buildAuthorizeUrl(response);
    response.redirect(url);
  }

  @Public()
  @Get("google/callback")
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const cookieState = cookies?.[GOOGLE_OAUTH_STATE_COOKIE];
    response.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, { path: "/" });

    if (!code || !this.googleSsoService.verifyState(cookieState, state)) {
      throw new UnauthorizedException({
        code: "GOOGLE_SSO_STATE_MISMATCH",
        message: "Google sign-in failed. Please try again.",
      });
    }

    const identity = await this.googleSsoService.exchangeCodeAndVerify(code);
    const organizationId = await this.organizationContext.resolveSingleOrganizationId();

    const user = await this.prisma.user.findUnique({
      where: { organization_id_email: { organization_id: organizationId, email: identity.email } },
    });

    if (!user || !user.active || !identity.emailVerified) {
      await this.audit.record({
        organizationId,
        actorType: "SYSTEM",
        actorId: null,
        action: AUDIT_ACTIONS.SSO_LOGIN_REJECTED_NO_MATCH,
        entityType: "User",
        entityId: user?.id ?? "00000000-0000-0000-0000-000000000000",
      });
      throw new UnauthorizedException({
        code: "GOOGLE_SSO_NO_MATCHING_ACCOUNT",
        message: "No active account matches this Google account.",
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    const { token, expiresInSeconds } = this.sessionService.signSession({
      userId: user.id,
      organizationId: user.organization_id,
      role: user.role,
    });
    this.sessionService.setSessionCookie(response, token, expiresInSeconds);
    this.csrfService.issueToken(response);

    await this.audit.record({
      organizationId,
      actorType: "USER",
      actorId: user.id,
      action: AUDIT_ACTIONS.SSO_LOGIN_SUCCEEDED,
      entityType: "User",
      entityId: user.id,
    });

    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  @Public()
  @Throttle(passwordResetThrottle())
  @HttpCode(204)
  @Post("password-reset/request")
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    await this.passwordResetService.request(dto.email);
  }

  @Public()
  @Throttle(passwordResetThrottle())
  @HttpCode(204)
  @Post("password-reset/confirm")
  async confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    await this.passwordResetService.confirm(dto.token, dto.password);
  }
}

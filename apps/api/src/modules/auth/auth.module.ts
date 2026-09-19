import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./controllers/auth.controller";
import { InvitationsController } from "./controllers/invitations.controller";
import { WorkProfileController } from "./controllers/work-profile.controller";
import { AuthService } from "./services/auth.service";
import { CsrfService } from "./services/csrf.service";
import { GoogleSsoService } from "./services/google-sso.service";
import { InvitationService } from "./services/invitation.service";
import { PasswordResetService } from "./services/password-reset.service";
import { PasswordService } from "./services/password.service";
import { SessionService } from "./services/session.service";
import { WorkProfileService } from "./services/work-profile.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { PermissionsGuard } from "./guards/permissions.guard";
import { CsrfGuard } from "./guards/csrf.guard";
import { TeamModule } from "../team/team.module";

/**
 * `JwtModule.register({})` with no static options: `SessionService` passes
 * the signing key/expiry explicitly on every `sign`/`verify` call (two
 * different secrets/audiences — session vs. password-reset tokens — live
 * in one service, so a single static module-level secret wouldn't fit).
 *
 * Imports `TeamModule` for TEAM_MEMBER onboarding KYC/payout gates only.
 */
@Module({
  imports: [JwtModule.register({}), TeamModule],
  controllers: [AuthController, InvitationsController, WorkProfileController],
  providers: [
    AuthService,
    SessionService,
    PasswordService,
    CsrfService,
    InvitationService,
    PasswordResetService,
    GoogleSsoService,
    WorkProfileService,
    JwtAuthGuard,
    PermissionsGuard,
    CsrfGuard,
  ],
  exports: [
    SessionService,
    CsrfService,
    PasswordService,
    JwtAuthGuard,
    PermissionsGuard,
    CsrfGuard,
  ],
})
export class AuthModule {}

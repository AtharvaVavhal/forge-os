import { Injectable } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "../../../database/prisma.service";
import type { AuthenticatedUser } from "../types/authenticated-request.interface";
import { CsrfService } from "./csrf.service";
import { SessionService } from "./session.service";
import type { UpsertWorkProfileDto } from "../dto/work-profile.dto";
import { toWorkProfileView, type WorkProfileView } from "./work-profile-views";

/**
 * Self-service "Work Profile" (K5 onboarding redesign) — lightweight
 * internal fields (job title, primary area, skills, bio) living directly
 * on `User`, never gated on and never required to enter Forge or to
 * withdraw. No `@RequirePermissions` — ownership via `actor.id`, same
 * pattern as `team/kyc` and `team/payout-profile`. Lives in the `auth`
 * module (not `team`) specifically so it can reach `SessionService`/
 * `CsrfService` directly — `AuthModule` already imports `TeamModule`, so
 * the reverse would be a circular module dependency.
 *
 * Unlike KYC/payout profile (separate tables), this writes `User` itself,
 * which bumps `User.updated_at` — the JWT security-stamp fence
 * (jwt-auth.guard.ts) would reject the caller's *own* still-in-hand
 * session token on its very next request. So, exactly like
 * `AuthService.completeOnboarding`, every write here re-signs and
 * re-issues `forge_session` (+ CSRF) before returning.
 */
@Injectable()
export class WorkProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly csrfService: CsrfService
  ) {}

  async getOwn(actor: AuthenticatedUser): Promise<WorkProfileView> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { job_title: true, primary_area: true, skills: true, bio: true, updated_at: true },
    });
    return toWorkProfileView(user);
  }

  async upsertOwn(
    actor: AuthenticatedUser,
    dto: UpsertWorkProfileDto,
    response: Response
  ): Promise<WorkProfileView> {
    const updated = await this.prisma.user.update({
      where: { id: actor.id },
      data: {
        ...(dto.jobTitle !== undefined ? { job_title: dto.jobTitle.trim() || null } : {}),
        ...(dto.primaryArea !== undefined ? { primary_area: dto.primaryArea.trim() || null } : {}),
        ...(dto.skills !== undefined ? { skills: dto.skills.map((skill) => skill.trim()).filter(Boolean) } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio.trim() || null } : {}),
      },
      select: { job_title: true, primary_area: true, skills: true, bio: true, updated_at: true },
    });

    const { token, expiresInSeconds } = this.sessionService.signSession({
      userId: actor.id,
      organizationId: actor.organizationId,
      role: actor.role,
    });
    this.sessionService.setSessionCookie(response, token, expiresInSeconds);
    this.csrfService.issueToken(response);

    return toWorkProfileView(updated);
  }
}

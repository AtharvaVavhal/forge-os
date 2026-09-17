import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Response } from "express";
import type { UserRole } from "@prisma/client";
import type { AppConfig } from "../../../config/configuration";
import type { InternalSessionPayload, PasswordResetTokenPayload } from "../types/jwt-payload.interface";

export const SESSION_COOKIE_NAME = "forge_session";

/**
 * Signs/verifies the `forge_session` JWT and owns its cookie attributes.
 *
 * No `Session` table exists in the frozen schema (Document 6 §5.2 item 3:
 * "no Session table in frozen schema"), so this is intentionally
 * stateless — the JWT itself, plus a live re-check of the `User` row on
 * every request (see `jwt-auth.guard.ts`), is the whole session model.
 * "Invalidate all sessions" (password change, deactivation) is enforced
 * by comparing the token's `iatMs` against `User.updated_at` in the
 * guard, not by a revocation list — see the guard for the full
 * explanation, including why `iatMs` (a custom millisecond-precision
 * claim) is used instead of the standard second-precision JWT `iat`.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>
  ) {}

  signSession(params: { userId: string; organizationId: string; role: UserRole }): {
    token: string;
    expiresInSeconds: number;
  } {
    const expiresInSeconds = this.config.get("auth.sessionJwtTtlSeconds", { infer: true });
    const payload: Pick<InternalSessionPayload, "sub" | "org" | "role" | "aud" | "iatMs"> = {
      sub: params.userId,
      org: params.organizationId,
      role: params.role,
      aud: "internal",
      iatMs: Date.now(),
    };
    const token = this.jwt.sign(payload, {
      secret: this.signingKey(),
      expiresIn: expiresInSeconds,
    });
    return { token, expiresInSeconds };
  }

  /** Throws a coded `UnauthorizedException` (`UNAUTHENTICATED`) on any
   * invalid/expired/wrong-audience token — deliberately generic, matching
   * `JwtAuthGuard`'s other 401 paths (no cookie, inactive user, org
   * mismatch, stale token all use the same code); there's no reason to
   * tell a caller *why* their session token didn't work. */
  verifySession(token: string): InternalSessionPayload {
    try {
      const payload = this.jwt.verify<InternalSessionPayload>(token, {
        secret: this.signingKey(),
      });
      if (payload.aud !== "internal") {
        throw new Error("wrong audience");
      }
      return payload;
    } catch {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Authentication required.",
      });
    }
  }

  signPasswordResetToken(userId: string): string {
    const ttl = this.config.get("auth.passwordResetTokenTtlSeconds", { infer: true });
    const payload: Pick<PasswordResetTokenPayload, "sub" | "aud" | "iatMs"> = {
      sub: userId,
      aud: "internal-password-reset",
      iatMs: Date.now(),
    };
    return this.jwt.sign(payload, { secret: this.signingKey(), expiresIn: ttl });
  }

  /** Throws a coded `UnauthorizedException` (`PASSWORD_RESET_TOKEN_INVALID`)
   * on any invalid/expired/wrong-audience token — the same code
   * `PasswordResetService.confirm()` uses for its own later single-use
   * check, so every password-reset-token failure mode is indistinguishable
   * to the caller (Document 6 §7 doesn't require these sub-cases to be
   * distinguishable from each other, only that email existence never
   * leaks — see password-reset.service.ts). */
  verifyPasswordResetToken(token: string): PasswordResetTokenPayload {
    try {
      const payload = this.jwt.verify<PasswordResetTokenPayload>(token, {
        secret: this.signingKey(),
      });
      if (payload.aud !== "internal-password-reset") {
        throw new Error("wrong audience");
      }
      return payload;
    } catch {
      throw new UnauthorizedException({
        code: "PASSWORD_RESET_TOKEN_INVALID",
        message: "This password reset link is invalid or has expired.",
      });
    }
  }

  setSessionCookie(response: Response, token: string, expiresInSeconds: number): void {
    response.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.config.get("cookies.secure", { infer: true }),
      // Frozen: Document 6 §5.1 — "SameSite=Strict (Doc 1 §5, with CSRF)".
      sameSite: "strict",
      path: "/",
      domain: this.config.get("cookies.domain", { infer: true }),
      maxAge: expiresInSeconds * 1000,
    });
  }

  clearSessionCookie(response: Response): void {
    response.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: this.config.get("cookies.secure", { infer: true }),
      sameSite: "strict",
      path: "/",
      domain: this.config.get("cookies.domain", { infer: true }),
    });
  }

  private signingKey(): string {
    return this.config.get("auth.sessionJwtSigningKey", { infer: true });
  }
}

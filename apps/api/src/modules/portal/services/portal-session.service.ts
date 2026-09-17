import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Response } from "express";
import type { AppConfig } from "../../../config/configuration";
import type { PortalSessionPayload } from "../types/portal-jwt-payload.interface";

export const PORTAL_SESSION_COOKIE_NAME = "portal_session";

/**
 * Signs/verifies the `portal_session` JWT (`aud: portal`) and owns its
 * cookie attributes (Document 5 §2.9 / Document 6 §1.1 / §5.1).
 *
 * Mirrors internal `SessionService` patterns (including `iatMs` security
 * stamp) but never shares cookie name or audience with `forge_session`.
 */
@Injectable()
export class PortalSessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>
  ) {}

  signSession(params: {
    clientUserId: string;
    organizationId: string;
    companyId: string;
  }): { token: string; expiresInSeconds: number } {
    const expiresInSeconds = this.config.get("auth.sessionJwtTtlSeconds", { infer: true });
    const payload: Pick<PortalSessionPayload, "sub" | "org" | "companyId" | "aud" | "iatMs"> = {
      sub: params.clientUserId,
      org: params.organizationId,
      companyId: params.companyId,
      aud: "portal",
      iatMs: Date.now(),
    };
    const token = this.jwt.sign(payload, {
      secret: this.signingKey(),
      expiresIn: expiresInSeconds,
    });
    return { token, expiresInSeconds };
  }

  verifySession(token: string): PortalSessionPayload {
    try {
      const payload = this.jwt.verify<PortalSessionPayload>(token, {
        secret: this.signingKey(),
      });
      if (payload.aud !== "portal") {
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

  setSessionCookie(response: Response, token: string, expiresInSeconds: number): void {
    response.cookie(PORTAL_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.config.get("cookies.secure", { infer: true }),
      sameSite: "strict",
      path: "/",
      domain: this.config.get("cookies.domain", { infer: true }),
      maxAge: expiresInSeconds * 1000,
    });
  }

  clearSessionCookie(response: Response): void {
    response.clearCookie(PORTAL_SESSION_COOKIE_NAME, {
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

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import type { AppConfig } from "../../../config/configuration";

export const CSRF_COOKIE_NAME = "forge_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Double-submit-cookie CSRF defense (Step 12 — explicit, real token
 * validation; `SameSite=Strict` alone is not treated as sufficient, per
 * the task's own instruction, even though Strict already blocks
 * cross-site cookie attachment in compliant browsers — this is
 * deliberate defense-in-depth against SameSite implementation gaps/older
 * browsers, not redundant by mistake).
 *
 * The CSRF cookie is deliberately **not** httpOnly — the frontend must be
 * able to read it (via `document.cookie`) to echo it back as the
 * `X-CSRF-Token` header on state-changing requests (`@forge/api-client`
 * does this automatically, see packages/api-client). It carries no
 * authentication value on its own — an attacker who could read this
 * cookie could already read anything else on the page.
 */
@Injectable()
export class CsrfService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  issueToken(response: Response): string {
    const token = randomBytes(32).toString("hex");
    response.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: this.config.get("cookies.secure", { infer: true }),
      sameSite: "strict",
      path: "/",
      domain: this.config.get("cookies.domain", { infer: true }),
      // No `maxAge` — a session-length cookie, cleared alongside the
      // session cookie on logout.
    });
    return token;
  }

  clearToken(response: Response): void {
    response.clearCookie(CSRF_COOKIE_NAME, {
      httpOnly: false,
      secure: this.config.get("cookies.secure", { infer: true }),
      sameSite: "strict",
      path: "/",
      domain: this.config.get("cookies.domain", { infer: true }),
    });
  }

  /** Constant-time comparison — a CSRF check that leaks timing information
   * about how much of the token matched is a (minor, but needless) flaw. */
  matches(cookieValue: string | undefined, headerValue: string | undefined): boolean {
    if (!cookieValue || !headerValue) return false;
    const a = Buffer.from(cookieValue);
    const b = Buffer.from(headerValue);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}

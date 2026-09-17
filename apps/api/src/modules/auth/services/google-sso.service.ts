import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "node:crypto";
import type { Response } from "express";
import type { AppConfig } from "../../../config/configuration";

export const GOOGLE_OAUTH_STATE_COOKIE = "forge_google_oauth_state";
const GOOGLE_AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES = ["openid", "email", "profile"];

export interface GoogleVerifiedIdentity {
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/**
 * The only IdP (Document 6 §4.1) — "start" builds Google's authorize URL,
 * "callback" exchanges the returned code and verifies the id_token.
 *
 * Client id/secret/redirect URI are environment-level configuration
 * (`GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`/`_REDIRECT_URI`), never hardcoded —
 * Document 6 §4.1 explicitly leaves "exact Google OAuth configuration
 * values... NOT CURRENTLY DEFINED" beyond "use environment variables."
 * If they're unset, SSO endpoints return a clear 503 rather than the app
 * failing to boot — Google SSO is legitimately optional to have
 * configured in a given environment (e.g. local dev without real
 * credentials).
 *
 * id_token signature verification uses `google-auth-library` (Google's
 * own client) rather than hand-rolled JWKS/signature checking — this is
 * exactly the kind of crypto-adjacent correctness where using a
 * well-audited library is the right call, not a shortcut.
 *
 * Provisioning scope, deliberately conservative: this service only
 * *authenticates an existing, active* `User` whose email matches the
 * Google-verified email (Document 6 §4.2: "map Google account to User by
 * email"). It does not auto-create a `User` on first SSO login — Document
 * 6 §1.2 marks "exact provisioning UX beyond invitation + SSO" as NOT
 * CURRENTLY DEFINED, and silently creating an internal account from an
 * unauthenticated OAuth callback is a security-sensitive decision this
 * phase does not make unilaterally. See docs/IMPLEMENTATION-PHASE-1.md.
 */
@Injectable()
export class GoogleSsoService {
  private readonly oauthClient: OAuth2Client | undefined;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const google = this.config.get("google", { infer: true });
    if (google.configured) {
      this.oauthClient = new OAuth2Client(google.clientId, google.clientSecret, google.redirectUri);
    }
  }

  isConfigured(): boolean {
    return this.config.get("google.configured", { infer: true });
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({
        code: "GOOGLE_SSO_NOT_CONFIGURED",
        message: "Google Workspace sign-in is not configured in this environment.",
      });
    }
  }

  /** Generates and cookie-stores an anti-CSRF `state` value, returns the
   * URL to redirect the browser to. */
  buildAuthorizeUrl(response: Response): string {
    this.assertConfigured();
    const google = this.config.get("google", { infer: true });

    const state = randomBytes(16).toString("hex");
    response.cookie(GOOGLE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: this.config.get("cookies.secure", { infer: true }),
      sameSite: "lax", // Lax, not Strict: this cookie must survive the
      // top-level cross-site redirect back from accounts.google.com —
      // Strict would drop it on that navigation, breaking the state
      // round-trip that protects the OAuth flow itself.
      path: "/",
      maxAge: 5 * 60 * 1000,
    });

    const url = new URL(GOOGLE_AUTHORIZE_ENDPOINT);
    url.searchParams.set("client_id", google.clientId!);
    url.searchParams.set("redirect_uri", google.redirectUri!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }

  verifyState(cookieState: string | undefined, callbackState: string | undefined): boolean {
    return Boolean(cookieState) && cookieState === callbackState;
  }

  async exchangeCodeAndVerify(code: string): Promise<GoogleVerifiedIdentity> {
    this.assertConfigured();
    const google = this.config.get("google", { infer: true });

    const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: google.clientId!,
        client_secret: google.clientSecret!,
        redirect_uri: google.redirectUri!,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      throw new UnauthorizedException({
        code: "GOOGLE_SSO_EXCHANGE_FAILED",
        message: "Google sign-in failed. Please try again.",
      });
    }

    const tokenBody = (await tokenResponse.json()) as { id_token?: string };
    if (!tokenBody.id_token) {
      throw new UnauthorizedException({
        code: "GOOGLE_SSO_EXCHANGE_FAILED",
        message: "Google sign-in failed. Please try again.",
      });
    }

    const ticket = await this.oauthClient!.verifyIdToken({
      idToken: tokenBody.id_token,
      audience: google.clientId,
    });
    const claims = ticket.getPayload();
    if (!claims?.email) {
      throw new UnauthorizedException({
        code: "GOOGLE_SSO_EXCHANGE_FAILED",
        message: "Google sign-in failed. Please try again.",
      });
    }

    return {
      email: claims.email,
      emailVerified: claims.email_verified ?? false,
      name: typeof claims.name === "string" && claims.name.length > 0 ? claims.name : null,
    };
  }
}

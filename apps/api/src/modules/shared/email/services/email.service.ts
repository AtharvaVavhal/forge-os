import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import type { AppConfig } from "../../../../config/configuration";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendEmailResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "provider_error" };

/**
 * Thin wrapper around Resend (Document 6 §20, F10.3). Feature-gated like
 * Razorpay/R2/Google SSO — see `configuration.ts` for why: invitation
 * creation and password-reset requests must keep working (DB writes, token
 * issuance, anti-enumeration responses) even when email isn't configured,
 * so this never throws for the "not configured" case. Callers get an
 * honest result instead and decide how to surface it — unlike Razorpay/R2,
 * where the entire endpoint's purpose IS the integration, email is a side
 * effect of two auth flows that must keep functioning on their own.
 *
 * Never logs a raw token, a full invitation/reset URL, or the API key —
 * only the recipient address and a safe, provider-supplied error
 * name/message (Resend's own SDK never returns the API key in its error
 * shape).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;
  private readonly from: string | null;
  readonly configured: boolean;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const email = this.config.get("email", { infer: true });
    this.configured = email.configured;
    this.client = email.configured && email.apiKey ? new Resend(email.apiKey) : null;
    this.from = email.configured ? (email.from ?? null) : null;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (!this.configured || !this.client || !this.from) {
      this.logger.warn(
        `Email not sent — Resend is not configured (to="${input.to}", subject="${input.subject}").`
      );
      return { sent: false, reason: "not_configured" };
    }

    try {
      const result = await this.client.emails.send({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });

      if (result.error) {
        this.logger.error(
          `Resend email send failed (to="${input.to}", subject="${input.subject}"): ${result.error.name} — ${result.error.message}`
        );
        return { sent: false, reason: "provider_error" };
      }

      return { sent: true };
    } catch (error) {
      this.logger.error(
        `Resend email send threw (to="${input.to}", subject="${input.subject}"): ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
      return { sent: false, reason: "provider_error" };
    }
  }
}

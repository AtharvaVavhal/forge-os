import type { RenderedEmail } from "./invitation-email";

export interface PasswordResetEmailInput {
  resetUrl: string;
  expiresInMinutes: number;
}

/** Static subject line — never includes the token/URL, so it stays safe to log. */
const SUBJECT = "Reset your FORGE password";

/**
 * Plain, self-contained HTML — no external stylesheets, fonts, or images.
 * Deliberately does not confirm or deny whose inbox this is (Document 6 §7
 * anti-enumeration) — the email itself is only ever sent to an address that
 * already resolved to an active user server-side, but its content stays
 * generic regardless.
 */
export function buildPasswordResetEmail(input: PasswordResetEmailInput): RenderedEmail {
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e5e0;">
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b6b63;">FORGE</p>
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Reset your password</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
            We received a request to reset the password for this FORGE account. Use the button below to choose a new one.
          </p>
          <p style="margin:0 0 24px;">
            <a href="${input.resetUrl}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600;">Reset password</a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b6b63;">This link expires in ${input.expiresInMinutes} minutes and can only be used once.</p>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6b6b63;">
            If you didn't request this, you can safely ignore this email — your password will not change.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "Reset your FORGE password",
    "",
    "We received a request to reset the password for this FORGE account.",
    "",
    `Reset your password: ${input.resetUrl}`,
    "",
    `This link expires in ${input.expiresInMinutes} minutes and can only be used once.`,
    "",
    "If you didn't request this, you can safely ignore this email — your password will not change.",
  ].join("\n");

  return { subject: SUBJECT, html, text };
}

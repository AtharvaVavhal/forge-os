import { InvitationScope, UserRole } from "@prisma/client";

export interface InvitationEmailInput {
  organizationName: string;
  inviterName: string;
  scope: InvitationScope;
  role: UserRole | null;
  acceptUrl: string;
  expiresAt: Date;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function humanizeRole(role: UserRole): string {
  return role
    .toLowerCase()
    .split("_")
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** Static subject line — never includes the token/URL, so it stays safe to log. */
const SUBJECT = "You've been invited to FORGE";

/**
 * Plain, self-contained HTML — no external stylesheets, fonts, or images
 * (nothing for an email client to block or a tracking pixel to hide in),
 * so it renders identically and safely everywhere.
 */
export function buildInvitationEmail(input: InvitationEmailInput): RenderedEmail {
  const roleLine =
    input.scope === InvitationScope.CLIENT
      ? "You're invited to the FORGE Client Portal."
      : input.role
        ? `You're invited to join as <strong>${humanizeRole(input.role)}</strong>.`
        : "You're invited to join FORGE.";
  const roleLineText =
    input.scope === InvitationScope.CLIENT
      ? "You're invited to the FORGE Client Portal."
      : input.role
        ? `You're invited to join as ${humanizeRole(input.role)}.`
        : "You're invited to join FORGE.";
  const expiresText = input.expiresAt.toUTCString();

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e5e0;">
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b6b63;">FORGE</p>
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">You've been invited to FORGE</h1>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">
            <strong>${escapeHtml(input.inviterName)}</strong> invited you to join
            <strong>${escapeHtml(input.organizationName)}</strong> on FORGE.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">${roleLine}</p>
          <p style="margin:0 0 24px;">
            <a href="${input.acceptUrl}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600;">Accept invitation</a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b6b63;">This link expires on ${expiresText} and can only be used once.</p>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6b6b63;">
            If you weren't expecting this invitation, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "You've been invited to FORGE",
    "",
    `${input.inviterName} invited you to join ${input.organizationName} on FORGE.`,
    roleLineText,
    "",
    `Accept your invitation: ${input.acceptUrl}`,
    "",
    `This link expires on ${expiresText} and can only be used once.`,
    "",
    "If you weren't expecting this invitation, you can safely ignore this email.",
  ].join("\n");

  return { subject: SUBJECT, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

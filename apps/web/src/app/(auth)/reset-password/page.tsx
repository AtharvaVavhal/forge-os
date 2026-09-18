import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const tokenValue = Array.isArray(params.token) ? params.token[0] : params.token;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="mono text-[length:var(--text-mono-label-size)] uppercase tracking-[var(--text-mono-label-tracking)] text-steel">
          Password reset
        </p>
        <h1 className="font-display text-[length:var(--text-section-title-size)] font-bold leading-[var(--text-section-title-leading)] text-ink">
          Choose a new password
        </h1>
        <p className="font-display text-[length:var(--text-body-size)] leading-[var(--text-body-leading)] text-ink/70">
          Passwords must be at least 12 characters. After a successful reset you will sign in again.
        </p>
      </div>
      <ResetPasswordForm token={tokenValue ?? ""} />
    </div>
  );
}

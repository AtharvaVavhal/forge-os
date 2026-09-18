import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="mono text-[length:var(--text-mono-label-size)] uppercase tracking-[var(--text-mono-label-tracking)] text-steel">
          Password reset
        </p>
        <h1 className="font-display text-[length:var(--text-section-title-size)] font-bold leading-[var(--text-section-title-leading)] text-ink">
          Reset your password
        </h1>
        <p className="font-display text-[length:var(--text-body-size)] leading-[var(--text-body-leading)] text-ink/70">
          Enter your FORGE email. If an account exists, we send a reset link. The response never
          confirms whether the email is registered.
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}

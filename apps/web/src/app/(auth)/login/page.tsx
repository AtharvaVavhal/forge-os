import { redirectIfAuthenticated } from "@/features/auth/session/require-workspace-session";
import { LoginForm } from "@/features/auth/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string | string[]; sso?: string | string[] }>;
}) {
  await redirectIfAuthenticated("/dashboard");

  const params = await searchParams;
  const expiredValue = Array.isArray(params.expired) ? params.expired[0] : params.expired;
  const expired = expiredValue === "1" || expiredValue === "true";
  const ssoValue = Array.isArray(params.sso) ? params.sso[0] : params.sso;
  const ssoHint =
    ssoValue === "no_match"
      ? "No active Forge account matches that Google account."
      : ssoValue === "failed"
        ? "Google sign-in failed. Please try again."
        : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="mono text-[length:var(--text-mono-label-size)] uppercase tracking-[var(--text-mono-label-tracking)] text-steel">
          Sign in
        </p>
        <h1 className="font-display text-[length:var(--text-section-title-size)] font-bold leading-[var(--text-section-title-leading)] text-ink">
          Continue to FORGE
        </h1>
        <p className="font-display text-[length:var(--text-body-size)] leading-[var(--text-body-leading)] text-ink/70">
          Use your FORGE email. Sessions are stored as an httpOnly cookie — not in this browser’s storage.
        </p>
        {ssoHint ? (
          <p className="type-helper text-danger-deep" role="alert">
            {ssoHint}
          </p>
        ) : null}
      </div>
      <LoginForm expired={expired} />
    </div>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/feedback/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  classifyPortalLoginFailure,
  portalLoginFailureMessage,
} from "../api/classify-portal-error";
import { loginPortal } from "../api/portal-api";
import {
  validatePortalLoginForm,
  type PortalLoginFieldErrors,
} from "../schemas/login-schema";

export function PortalLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams?.get("reason") === "session_expired";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<PortalLoginFieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    const values = { email, password };
    const errors = validatePortalLoginForm(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setLoading(true);
    try {
      await loginPortal({ email: email.trim(), password });
      router.push("/portal");
      router.refresh();
    } catch (error) {
      const kind = classifyPortalLoginFailure(error);
      setGeneralError(portalLoginFailureMessage(kind));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[var(--forge-paper,#faf8f5)] text-[var(--forge-ink,#1a1918)] px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-lg bg-[var(--forge-ink,#1a1918)] text-[var(--forge-paper,#faf8f5)] items-center justify-center font-bold text-xl tracking-widest font-mono mx-auto">
            F
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--forge-ink,#1a1918)]">
            Client Portal
          </h1>
          <p className="text-sm text-[var(--forge-ink-muted,#78736a)]">
            Sign in to view your company’s proposals, projects, and invoices.
          </p>
        </div>

        {sessionExpired && (
          <Alert variant="warning" title="Session Expired">
            Your portal session has expired. Please sign in again to continue.
          </Alert>
        )}

        {generalError && (
          <Alert variant="danger" title="Sign-in failed">
            {generalError}
          </Alert>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5 bg-white p-8 rounded-xl border border-[var(--forge-border,#e5dfd5)] shadow-sm">
          <div>
            <label
              htmlFor="portal-email"
              className="block text-sm font-medium text-[var(--forge-ink,#1a1918)] mb-1"
            >
              Email address
            </label>
            <Input
              id="portal-email"
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) {
                  setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }
              }}
              disabled={loading}
              placeholder="client@company.com"
              aria-invalid={Boolean(fieldErrors.email)}
              data-testid="portal-login-email-input"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-red-600" data-testid="portal-login-email-error">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="portal-password"
              className="block text-sm font-medium text-[var(--forge-ink,#1a1918)] mb-1"
            >
              Password
            </label>
            <Input
              id="portal-password"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              disabled={loading}
              aria-invalid={Boolean(fieldErrors.password)}
              data-testid="portal-login-password-input"
            />
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-600" data-testid="portal-login-password-error">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full justify-center"
            disabled={loading}
            data-testid="portal-login-submit-button"
          >
            {loading ? "Signing in…" : "Sign In to Portal"}
          </Button>
        </form>

        <p className="text-center text-xs text-[var(--forge-ink-muted,#78736a)]">
          Protected by Forge Client Portal Security &bull; Read-only client plane
        </p>
      </div>
    </div>
  );
}

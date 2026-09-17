"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getGoogleWorkspaceStartPath } from "@/lib/api/base-url";
import { cn } from "@/lib/cn";
import { loginWithPassword } from "../api/auth-api";
import { classifyLoginFailure, loginFailureMessage } from "../api/classify-auth-error";
import { authQueryKeys } from "../api/query-keys";
import { validateLoginForm, type LoginFieldErrors } from "../schemas/login-schema";
import type { InternalUser, LoginRequest } from "../types";

export function LoginForm({
  expired = false,
  onLogin = loginWithPassword,
  googleSsoHref = getGoogleWorkspaceStartPath(),
}: {
  expired?: boolean;
  onLogin?: (input: LoginRequest) => Promise<InternalUser | void>;
  googleSsoHref?: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const emailId = useId();
  const passwordId = useId();
  const formErrorId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });
  const [formError, setFormError] = useState<string | null>(
    expired ? "Your session expired. Sign in again." : null
  );
  const [formErrorTone, setFormErrorTone] = useState<"danger" | "info">(expired ? "info" : "danger");

  const mutation = useMutation({
    mutationFn: (input: LoginRequest) => onLogin(input),
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.all });
      const destination = user?.onboardedAt ? "/dashboard" : "/onboarding";
      router.replace(destination);
      router.refresh();
    },
    onError: (error) => {
      const kind = classifyLoginFailure(error);
      setFormErrorTone("danger");
      setFormError(loginFailureMessage(kind));
      document.getElementById(formErrorId)?.focus();
    },
  });

  function applyFieldErrors(next: LoginFieldErrors): boolean {
    setFieldErrors(next);
    const first = next.email ? "email" : next.password ? "password" : null;
    if (first === "email") emailRef.current?.focus();
    if (first === "password") passwordRef.current?.focus();
    return Object.keys(next).length === 0;
  }

  function handleBlur(field: "email" | "password") {
    setTouched((current) => ({ ...current, [field]: true }));
    const next = validateLoginForm({ email, password });
    setFieldErrors((current) => ({ ...current, [field]: next[field] }));
  }

  function handleChange(field: "email" | "password", value: string) {
    if (field === "email") setEmail(value);
    else setPassword(value);

    if (formError && formErrorTone === "danger") setFormError(null);

    if (touched[field] && fieldErrors[field]) {
      const next = validateLoginForm({
        email: field === "email" ? value : email,
        password: field === "password" ? value : password,
      });
      setFieldErrors((current) => ({ ...current, [field]: next[field] }));
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;

    setTouched({ email: true, password: true });
    const next = validateLoginForm({ email, password });
    if (!applyFieldErrors(next)) return;

    mutation.mutate({ email: email.trim(), password });
  }

  const submitting = mutation.isPending;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex w-full flex-col gap-4"
      aria-describedby={formError ? formErrorId : undefined}
    >
      {formError ? (
        <Alert id={formErrorId} tone={formErrorTone} title={formErrorTone === "info" ? "Session ended" : "Couldn’t sign in"}>
          <p tabIndex={-1} id={`${formErrorId}-text`}>
            {formError}
          </p>
        </Alert>
      ) : null}

      <Field id={emailId} label="Email" required error={fieldErrors.email}>
        <Input
          ref={emailRef}
          id={emailId}
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          invalid={Boolean(fieldErrors.email)}
          disabled={submitting}
          onBlur={() => handleBlur("email")}
          onChange={(event) => handleChange("email", event.target.value)}
          aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
          className="min-h-11"
        />
      </Field>

      <Field id={passwordId} label="Password" required error={fieldErrors.password}>
        <div className="relative">
          <Input
            ref={passwordRef}
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            invalid={Boolean(fieldErrors.password)}
            disabled={submitting}
            onBlur={() => handleBlur("password")}
            onChange={(event) => handleChange("password", event.target.value)}
            aria-describedby={fieldErrors.password ? `${passwordId}-error` : undefined}
            className="min-h-11 pr-24"
          />
          <button
            type="button"
            className="font-display absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-lg px-2 py-1 text-[length:var(--text-helper-size)] font-semibold text-steel hover:text-ink"
            onClick={() => setShowPassword((value) => !value)}
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            disabled={submitting}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </Field>

      <p className="text-right">
        <a
          href="/forgot-password"
          className="font-display text-[length:var(--text-helper-size)] font-semibold text-steel hover:text-ink hover:underline"
        >
          Forgot password?
        </a>
      </p>

      <Button type="submit" variant="primary" size="lg" loading={submitting} className="mt-2 w-full">
        {submitting ? "Signing in" : "Sign in"}
      </Button>

      {googleSsoHref ? (
        <>
          <div className="flex items-center gap-3" role="separator" aria-label="or">
            <span className="h-px flex-1 bg-steel/20" />
            <span className="mono text-[length:var(--text-mono-label-size)] uppercase tracking-[var(--text-mono-label-tracking)] text-steel">
              or
            </span>
            <span className="h-px flex-1 bg-steel/20" />
          </div>
          <a
            href={googleSsoHref}
            className={cn(
              "font-display inline-flex h-11 min-h-11 cursor-pointer items-center justify-center rounded-full border border-steel/20 px-6 text-[length:var(--text-button-size)] font-semibold text-ink",
              "transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-forge)]",
              "motion-safe:hover:scale-[1.02] hover:bg-ink/[0.04] motion-safe:active:scale-[0.98]",
              submitting && "pointer-events-none opacity-60"
            )}
            aria-disabled={submitting || undefined}
            tabIndex={submitting ? -1 : undefined}
          >
            Continue with Google Workspace
          </a>
        </>
      ) : null}
    </form>
  );
}

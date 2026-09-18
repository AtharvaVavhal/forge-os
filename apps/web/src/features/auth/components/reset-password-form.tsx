"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmPasswordReset } from "../api/auth-api";
import { queryErrorMessage } from "@/lib/api/query-error";

export function ResetPasswordForm({ token: tokenFromUrl }: { token: string }) {
  const passwordId = useId();
  const confirmId = useId();
  const router = useRouter();
  const [token] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Strip ?token= from the address bar / history after capturing it in state.
  useEffect(() => {
    if (!tokenFromUrl) return;
    if (typeof window === "undefined") return;
    if (!window.location.search.includes("token=")) return;
    router.replace("/reset-password", { scroll: false });
  }, [router, tokenFromUrl]);

  const mutation = useMutation({
    mutationFn: () => confirmPasswordReset(token, password),
    onSuccess: () => {
      router.replace("/login");
      router.refresh();
    },
  });

  if (!token) {
    return (
      <Alert tone="danger" title="Missing token">
        Open the reset link from your email, or request a new one from{" "}
        <Link href="/forgot-password" className="font-semibold underline">
          forgot password
        </Link>
        .
      </Alert>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="reset-password-form"
      onSubmit={(event) => {
        event.preventDefault();
        setLocalError(null);
        if (password.length < 12) {
          setLocalError("Password must be at least 12 characters.");
          return;
        }
        if (password !== confirm) {
          setLocalError("Passwords do not match.");
          return;
        }
        mutation.mutate();
      }}
    >
      {localError || mutation.isError ? (
        <Alert tone="danger" title="Could not reset password">
          {localError ?? queryErrorMessage(mutation.error)}
        </Alert>
      ) : null}
      <Field id={passwordId} label="New password" required hint="At least 12 characters.">
        <Input
          id={passwordId}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={12}
          maxLength={128}
          required
        />
      </Field>
      <Field id={confirmId} label="Confirm password" required>
        <Input
          id={confirmId}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          minLength={12}
          maxLength={128}
          required
        />
      </Field>
      <Button type="submit" loading={mutation.isPending}>
        Update password
      </Button>
      <Link href="/login" className="type-helper text-center text-steel hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}

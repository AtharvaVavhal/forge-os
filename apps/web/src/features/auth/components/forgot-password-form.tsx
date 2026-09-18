"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Alert } from "@/components/feedback/alert";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "../api/auth-api";
import { queryErrorMessage } from "@/lib/api/query-error";

export function ForgotPasswordForm() {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [localError, setLocalError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: () => requestPasswordReset(email.trim()),
    onSuccess: () => setSubmitted(true),
  });

  if (submitted) {
    return (
      <div className="flex flex-col gap-4" data-testid="forgot-password-sent">
        <Alert tone="info" title="Check your email">
          If an account exists for that address, password reset instructions were sent. The message
          does not confirm whether the email is registered.
        </Alert>
        <Link href="/login" className="font-semibold hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!email.trim()) {
          setLocalError("Enter a valid email.");
          return;
        }
        setLocalError(undefined);
        mutation.mutate();
      }}
    >
      {mutation.isError ? (
        <Alert tone="danger" title="Request failed">
          {queryErrorMessage(mutation.error)}
        </Alert>
      ) : null}
      <Field id={emailId} label="Email" required error={localError}>
        <Input
          id={emailId}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (localError) setLocalError(undefined);
          }}
          required
          invalid={Boolean(localError)}
          aria-describedby={localError ? `${emailId}-error` : undefined}
        />
      </Field>
      <Button type="submit" loading={mutation.isPending}>
        Send reset link
      </Button>
      <Link href="/login" className="type-helper text-center text-steel hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}

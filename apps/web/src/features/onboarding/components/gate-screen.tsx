"use client";

import { ApiClientError } from "@forge/api-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { acceptInvitation, previewInvitation } from "@/features/auth/api/auth-api";
import { getGoogleWorkspaceStartPath } from "@/lib/api/base-url";
import { cn } from "@/lib/cn";
import { roleTitleForInvite } from "../copy";

export function GateScreen({ token }: { token: string }) {
  const [proceedError, setProceedError] = useState<string | null>(null);

  const preview = useQuery({
    // Do not put the raw invitation token in the query key (devtools / persistence).
    queryKey: ["invitations", "preview"],
    queryFn: () => previewInvitation(token),
    retry: false,
  });

  const proceed = useMutation({
    mutationFn: async () => {
      try {
        await acceptInvitation(token);
      } catch (error) {
        // Already redeemed (or otherwise invalid) — still offer Google so a
        // user who accepted but didn't finish SSO can continue. Google SSO
        // remains the authorization gate.
        if (!(error instanceof ApiClientError) || error.status !== 400) {
          throw error;
        }
      }
      window.location.assign(getGoogleWorkspaceStartPath());
    },
    onError: () => {
      setProceedError("Connection interrupted. Check your connection and try again.");
    },
  });

  const invalid = preview.isError;
  const inviterLine = useMemo(() => {
    if (!preview.data) return null;
    const roleTitle = roleTitleForInvite(preview.data.role);
    const inviter = preview.data.inviterName?.trim();
    if (inviter) {
      return `${inviter} invited you to join as ${roleTitle}.`;
    }
    return `You've been invited to join as ${roleTitle}.`;
  }, [preview.data]);

  if (preview.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper px-6">
        <p className="type-helper text-steel" role="status">
          Checking invitation…
        </p>
      </div>
    );
  }

  if (invalid) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center">
        <p className="type-mono-label text-steel">Forge</p>
        <h1 className="type-page-title mt-4 text-ink">This invitation link is invalid or has expired.</h1>
        <p className="type-body mt-3 max-w-md text-ink/70">
          Ask your team lead to send a new invitation, or sign in if you already have an account.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-md bg-ink px-8 font-display text-[length:var(--text-body-size)] font-semibold tracking-[0.04em] text-paper"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center">
      <p className="type-mono-label text-steel">Forge</p>
      <h1 className="font-display mt-6 max-w-xl text-[clamp(1.75rem,4vw,2.5rem)] font-bold leading-tight tracking-[-0.02em] text-ink">
        You&apos;ve been invited to Forge.
      </h1>
      {inviterLine ? (
        <p className="mt-4 max-w-lg font-[family-name:var(--font-body)] text-[length:var(--text-body-size)] leading-relaxed text-ink/75">
          {inviterLine}
        </p>
      ) : null}

      {proceedError ? (
        <p className="type-helper mt-6 text-danger-deep" role="alert">
          {proceedError}
        </p>
      ) : null}

      <button
        type="button"
        disabled={proceed.isPending}
        onClick={() => {
          setProceedError(null);
          proceed.mutate();
        }}
        className={cn(
          "mt-10 inline-flex min-h-12 items-center justify-center gap-3 rounded-md border border-steel/25 bg-paper-elev px-8",
          "font-display text-[length:var(--text-body-size)] font-semibold text-ink shadow-[var(--elevation-1)]",
          "transition-[background-color,transform] duration-150 ease-out",
          "hover:bg-ink/[0.04] motion-safe:active:scale-[0.98]",
          "disabled:opacity-60"
        )}
      >
        <GoogleMark />
        Continue with Google
      </button>

      <p className="type-mono-label mt-8 max-w-sm text-steel/70">
        By continuing, you agree to Forge&apos;s Terms of Service.
      </p>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logoutCurrentSession } from "../api/auth-api";
import { classifyLoginFailure, loginFailureMessage } from "../api/classify-auth-error";
import { clearClientAuthState } from "@/lib/query/session-expiry";

export function LogoutButton({
  variant = "ghost",
  size = "md",
  className,
}: {
  variant?: "ghost" | "secondary" | "inverse" | "destructive";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: logoutCurrentSession,
    onSuccess: () => {
      clearClientAuthState(queryClient);
      router.replace("/login");
      router.refresh();
    },
  });

  const errorMessage = mutation.isError
    ? loginFailureMessage(classifyLoginFailure(mutation.error))
    : null;

  return (
    <div className="flex flex-col items-stretch gap-2">
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        loading={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Signing out" : "Sign out"}
      </Button>
      {errorMessage ? (
        <p className="font-display text-[length:var(--text-error-size)] text-danger-deep" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

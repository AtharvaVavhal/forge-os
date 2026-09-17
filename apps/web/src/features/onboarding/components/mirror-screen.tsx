"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { ONBOARDING_ROLE_LABEL } from "../copy";
import type { UserRole } from "@forge/types";

export function MirrorScreen({
  name,
  role,
  onAdvance,
}: {
  name: string;
  role: UserRole;
  onAdvance: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [cueReady, setCueReady] = useState(false);
  const showCue = reducedMotion || cueReady;
  const liveId = useId();
  const advanced = useRef(false);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const timer = window.setTimeout(() => setCueReady(true), 1600);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  useEffect(() => {
    function advance() {
      if (advanced.current) return;
      advanced.current = true;
      onAdvance();
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Tab") return;
      advance();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAdvance]);

  const displayName = name.trim() || "Welcome";
  const roleLine = `${ONBOARDING_ROLE_LABEL[role]} · FORGE`;

  return (
    <main
      className="relative flex min-h-dvh cursor-pointer flex-col items-center justify-center bg-paper px-6 text-center"
      onClick={() => {
        if (advanced.current) return;
        advanced.current = true;
        onAdvance();
      }}
      aria-labelledby={liveId}
    >
      <div id={liveId} aria-live="polite" className="flex flex-col items-center gap-4">
        <h1
          className={cn(
            "font-display text-[clamp(2.25rem,6vw,4rem)] font-bold tracking-[-0.02em] text-ink",
            !reducedMotion && "animate-[forge-onboard-fade_300ms_ease-out_both]"
          )}
          style={!reducedMotion ? { animationDelay: "200ms" } : undefined}
        >
          {displayName}.
        </h1>
        <p
          className={cn(
            "font-mono text-[0.875rem] uppercase tracking-[0.08em] text-ink/50",
            !reducedMotion && "animate-[forge-onboard-fade_300ms_ease-out_both]"
          )}
          style={!reducedMotion ? { animationDelay: "500ms" } : undefined}
        >
          {roleLine}
        </p>
      </div>

      <p
        className={cn(
          "absolute bottom-10 font-mono text-[0.75rem] tracking-[0.06em] text-ink/40 transition-opacity duration-500",
          showCue ? "opacity-100" : "opacity-0"
        )}
      >
        Continue →
      </p>
    </main>
  );
}

function subscribeReducedMotion(onStoreChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );
}

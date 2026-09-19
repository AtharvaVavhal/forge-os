"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
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
    const timer = window.setTimeout(() => setCueReady(true), 1400);
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
            !reducedMotion && "animate-[forge-onboard-rise_220ms_ease-out_both]"
          )}
          style={!reducedMotion ? { animationDelay: "40ms" } : undefined}
        >
          {displayName}.
        </h1>
        <p
          className={cn(
            "font-mono text-[0.875rem] uppercase tracking-[0.08em] text-ink/50",
            !reducedMotion && "animate-[forge-onboard-fade_220ms_ease-out_both]"
          )}
          style={!reducedMotion ? { animationDelay: "120ms" } : undefined}
        >
          {roleLine}
        </p>
        <p
          className={cn(
            "mt-2 max-w-sm font-[family-name:var(--font-body)] text-[1rem] leading-relaxed text-ink/65",
            !reducedMotion && "animate-[forge-onboard-fade_220ms_ease-out_both]"
          )}
          style={!reducedMotion ? { animationDelay: "180ms" } : undefined}
        >
          This is how you&apos;ll appear inside Forge.
        </p>
      </div>

      <p
        className={cn(
          "absolute bottom-10 font-mono text-[0.75rem] tracking-[0.06em] text-ink/40 transition-opacity duration-500 motion-reduce:transition-none",
          showCue ? "opacity-100" : "opacity-0"
        )}
      >
        Continue →
      </p>
    </main>
  );
}

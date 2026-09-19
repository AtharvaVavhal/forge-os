"use client";

import { Children, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const STAGGER_MS = 90;

/**
 * Staggered entrance choreography for a completion moment (K5 onboarding
 * redesign's Success step, and the shared Enter-Forge screen): each child
 * fades + rises in shortly after the previous one, giving the checkmark →
 * heading → subtext → CTA sequence a settled, premium feel rather than
 * everything appearing at once. No confetti, no bounce — reuses the same
 * `forge-onboard-rise` keyframe as every other onboarding entrance.
 *
 * Renders each child in its own block wrapper to carry its own animation
 * delay; a parent `flex flex-col items-center` still centers correctly.
 */
export function SuccessTransition({ children }: { children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  const items = Children.toArray(children);

  return (
    <>
      {items.map((child, index) => (
        <div
          key={index}
          className={reducedMotion ? undefined : "motion-safe:animate-[forge-onboard-rise_220ms_ease-out_both]"}
          style={reducedMotion ? undefined : { animationDelay: `${index * STAGGER_MS}ms` }}
        >
          {child}
        </div>
      ))}
    </>
  );
}

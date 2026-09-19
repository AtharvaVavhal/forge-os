"use client";

import { useState, type AnimationEvent, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const ENTER_CLASS = "motion-safe:animate-[forge-onboard-rise_220ms_ease-out_both]";
const EXIT_CLASS = "motion-safe:animate-[forge-onboard-exit_160ms_ease-in_both]";

/**
 * Wraps one onboarding step's content and plays a brief exit animation on
 * the outgoing step before the incoming step enters — the "current step
 * fades slightly + translates out, next step enters with a slight fade +
 * translate" motion language shared across the whole flow. Keyed by
 * `stepKey`: changing it triggers the transition; re-rendering with the
 * same `stepKey` (e.g. a validation error appearing) never re-animates.
 *
 * Respects `prefers-reduced-motion` by swapping content instantly with no
 * transform/opacity animation at all — never just a faster version of the
 * same animation.
 *
 * The frozen outgoing content lives in state, adjusted directly during
 * render (React's documented pattern for deriving state from a changed
 * prop) rather than in a ref written from an effect — mutating a ref
 * during render isn't safe under concurrent rendering.
 */
export function StepTransition({ stepKey, children }: { stepKey: string; children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  const [renderedKey, setRenderedKey] = useState(stepKey);
  const [exiting, setExiting] = useState(false);
  const [frozenContent, setFrozenContent] = useState<ReactNode>(children);

  if (stepKey !== renderedKey && !exiting) {
    // A transition just started. `frozenContent` already holds whatever was
    // mirrored on the last steady-state render — the outgoing step's
    // content — so it's left untouched here.
    if (reducedMotion) {
      setRenderedKey(stepKey);
    } else {
      setExiting(true);
    }
  } else if (!exiting && stepKey === renderedKey && frozenContent !== children) {
    // Steady state: keep the frozen snapshot current so it's ready the
    // instant the next transition starts.
    setFrozenContent(children);
  }

  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (exiting) {
      setExiting(false);
      setRenderedKey(stepKey);
    }
  }

  const content = exiting ? frozenContent : children;

  return (
    <div key={renderedKey} onAnimationEnd={handleAnimationEnd} className={exiting ? EXIT_CLASS : ENTER_CLASS}>
      {content}
    </div>
  );
}

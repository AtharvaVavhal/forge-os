"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export function Tooltip({
  content,
  children,
  side = "right",
}: {
  content: string;
  children: React.ReactNode;
  side?: "right" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const id = useId();

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  function show() {
    timer.current = window.setTimeout(() => setOpen(true), 400);
  }

  function hide() {
    if (timer.current) window.clearTimeout(timer.current);
    setOpen(false);
  }

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-[var(--z-dropdown)] rounded-lg bg-ink px-2 py-1 font-display text-[length:var(--text-body-small-size)] whitespace-nowrap text-paper shadow-[var(--elevation-2)]",
            side === "right" && "top-1/2 left-full ml-2 -translate-y-1/2",
            side === "bottom" && "top-full left-1/2 mt-2 -translate-x-1/2"
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}

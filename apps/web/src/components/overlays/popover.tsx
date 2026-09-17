"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useEscape } from "@/hooks/use-focus-trap";

export function Popover({
  trigger,
  children,
  align = "end",
  widthClass = "w-80",
}: {
  trigger: (props: { open: boolean; setOpen: (open: boolean) => void; panelId: string }) => ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEscape(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      {trigger({ open, setOpen, panelId })}
      {open ? (
        <div
          id={panelId}
          role="dialog"
          className={cn(
            "absolute top-full z-[var(--z-dropdown)] mt-2 rounded-xl border border-steel/20 bg-paper-elev p-3 shadow-[var(--elevation-2)]",
            widthClass,
            align === "end" ? "right-0" : "left-0"
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

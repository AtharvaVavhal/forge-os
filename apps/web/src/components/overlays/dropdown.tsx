"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useEscape } from "@/hooks/use-focus-trap";

export function Dropdown({
  trigger,
  children,
  align = "end",
  labelledBy,
}: {
  trigger: (props: {
    open: boolean;
    setOpen: (open: boolean) => void;
    triggerId: string;
    menuId: string;
  }) => ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  labelledBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const menuId = useId();
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
      {trigger({ open, setOpen, triggerId, menuId })}
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={labelledBy ?? triggerId}
          className={cn(
            "absolute top-full z-[var(--z-dropdown)] mt-2 min-w-48 rounded-xl border border-steel/20 bg-paper-elev py-1 shadow-[var(--elevation-2)]",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  children,
  onSelect,
  destructive = false,
}: {
  children: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "font-display flex min-h-9 w-full cursor-pointer items-center px-3 text-left text-[length:var(--text-body-size)]",
        destructive ? "text-danger-deep hover:bg-danger-soft" : "text-ink hover:bg-ink/[0.04]"
      )}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

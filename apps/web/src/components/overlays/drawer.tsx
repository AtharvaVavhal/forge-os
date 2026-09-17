"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import { useEscape, useFocusTrap } from "@/hooks/use-focus-trap";
import { useLockedBody } from "@/hooks/use-locked-body";
import { Portal } from "./portal";
import { IconX } from "@/components/icons";
import { IconButton } from "@/components/ui/icon-button";

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = "right",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: "right" | "left";
}) {
  const titleId = useId();
  const trapRef = useFocusTrap(open);
  useEscape(open, onClose);
  useLockedBody(open);

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[var(--z-drawer)]">
        <button
          type="button"
          className="absolute inset-0 cursor-default bg-ink/50"
          aria-label="Close panel"
          onClick={onClose}
        />
        <div
          ref={trapRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={
            side === "left"
              ? "absolute inset-y-0 left-0 flex h-full w-[min(100%,20rem)] flex-col bg-paper-elev p-[var(--space-drawer-padding)] shadow-[var(--elevation-drawer)]"
              : "absolute inset-y-0 right-0 flex h-full w-[min(100%,24rem)] flex-col bg-paper-elev p-[var(--space-drawer-padding)] shadow-[var(--elevation-drawer)]"
          }
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id={titleId} className="type-subsection text-ink">
              {title}
            </h2>
            <IconButton label="Close" onClick={onClose}>
              <IconX size={16} />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </Portal>
  );
}

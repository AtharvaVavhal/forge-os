"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useEscape, useFocusTrap } from "@/hooks/use-focus-trap";
import { useLockedBody } from "@/hooks/use-locked-body";
import { Portal } from "./portal";
import { IconX } from "@/components/icons";
import { IconButton } from "@/components/ui/icon-button";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
}) {
  const titleId = useId();
  const trapRef = useFocusTrap(open);
  useEscape(open, onClose);
  useLockedBody(open);

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[var(--z-modal-scrim)] flex items-start justify-center px-4 pt-[12vh]">
        <button
          type="button"
          className="absolute inset-0 cursor-default bg-ink/50"
          aria-label="Close dialog"
          onClick={onClose}
        />
        <div
          ref={trapRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy ?? titleId}
          className="relative z-[var(--z-modal)] w-full max-w-lg rounded-2xl border border-steel/15 bg-paper-elev p-[var(--space-modal-padding)] shadow-[var(--elevation-3)]"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id={titleId} className="type-subsection text-ink">
              {title}
            </h2>
            <IconButton label="Close" onClick={onClose}>
              <IconX size={16} />
            </IconButton>
          </div>
          <div className="type-body text-ink">{children}</div>
          {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button
            type="button"
            className={cn(
              "font-display inline-flex h-9 min-h-9 cursor-pointer items-center rounded-full px-4 text-[length:var(--text-button-size)] font-semibold text-ink hover:bg-ink/[0.04]"
            )}
            onClick={onClose}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cn(
              "font-display inline-flex h-9 min-h-9 cursor-pointer items-center rounded-full px-4 text-[length:var(--text-button-size)] font-semibold",
              destructive
                ? "border border-danger-deep text-danger-deep hover:bg-danger-soft"
                : "bg-ember-deep text-paper hover:bg-ember-deep/90"
            )}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-ink/80">{description}</p>
    </Modal>
  );
}

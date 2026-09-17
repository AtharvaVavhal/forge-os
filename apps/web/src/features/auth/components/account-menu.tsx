"use client";

import { useId, useState } from "react";
import { LogoutButton } from "./logout-button";
import type { InternalUser } from "../types";

function roleLabel(role: InternalUser["role"]): string {
  return role.replaceAll("_", " ");
}

export function AccountMenu({ user }: { user: InternalUser }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  return (
    <div className="relative">
      <button
        type="button"
        className="font-display flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left text-[length:var(--text-body-small-size)] hover:bg-ink/[0.04]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-surface-sunken text-[length:var(--text-helper-size)] font-semibold text-ink">
          {initials(user.name)}
        </span>
        <span className="hidden min-w-0 lg:flex lg:flex-col">
          <span className="truncate font-semibold text-ink">{user.name}</span>
          <span className="mono truncate text-[length:var(--text-mono-label-size)] uppercase tracking-[0.08em] text-steel">
            {roleLabel(user.role)}
          </span>
        </span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-[var(--z-dropdown)] mt-2 w-64 rounded-xl border border-steel/20 bg-paper-elev p-3 shadow-[var(--elevation-2)]"
        >
          <p className="font-display truncate text-[length:var(--text-body-small-size)] font-semibold text-ink">
            {user.name}
          </p>
          <p className="font-display truncate text-[length:var(--text-helper-size)] text-steel">{user.email}</p>
          <p className="mono mt-1 text-[length:var(--text-mono-label-size)] uppercase tracking-[0.08em] text-steel">
            {roleLabel(user.role)}
          </p>
          <div className="mt-3 border-t border-steel/15 pt-3">
            <LogoutButton variant="ghost" size="sm" className="w-full justify-start text-danger-deep" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "F";
}

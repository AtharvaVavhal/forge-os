"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV_ICONS } from "@/components/icons";
import { IconPanelLeft, IconX } from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { IconButton } from "@/components/ui/icon-button";
import { useAuthContext } from "@/features/auth/authorization/authorization-context";
import { filterNavTree } from "./filter-nav";
import { isNavItemActive, type NavItem } from "./nav-tree";
import { useIconRail, useWorkspaceShell } from "./shell-context";

function NavItemLink({
  item,
  collapsedVisual,
  onNavigate,
}: {
  item: NavItem;
  collapsedVisual: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isNavItemActive(pathname, item.href);
  const Icon = NAV_ICONS[item.icon];

  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "nav-item flex min-h-8 items-center gap-3 rounded-lg px-3 py-2 text-[length:var(--text-label-size)] font-semibold max-lg:min-h-11",
        active
          ? "bg-paper/[0.06] text-paper"
          : "text-paper/70 hover:bg-paper/[0.04] hover:text-paper"
      )}
    >
      {active ? (
        <span className="absolute top-0 bottom-0 left-0 w-0.5 bg-ember-deep" aria-hidden="true" />
      ) : null}
      <span className="relative flex min-w-0 items-center gap-3">
        <Icon size={20} className={active ? "text-ember-bright" : "text-paper/70"} />
        <span className="sidebar-expanded-only truncate">{item.label}</span>
      </span>
    </Link>
  );

  if (!collapsedVisual) return <div className="relative">{link}</div>;

  return (
    <Tooltip content={item.label}>
      <div className="relative">{link}</div>
    </Tooltip>
  );
}

function SidebarChrome({
  onNavigate,
  variant,
}: {
  onNavigate?: () => void;
  variant: "persistent" | "overlay";
}) {
  const auth = useAuthContext();
  const groups = filterNavTree(auth);
  const { toggleSidebarCollapsed, setMobileNavOpen } = useWorkspaceShell();
  const iconRail = useIconRail();
  const collapsedVisual = variant === "overlay" ? false : iconRail;

  return (
    <>
      <div className="flex h-16 items-center justify-between gap-2 px-3">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2 text-paper"
        >
          <span className="sidebar-mark-compact font-display text-lg font-bold">F</span>
          <span className="sidebar-mark-full font-display text-lg font-bold tracking-tight">FORGE</span>
          <span className="sidebar-expanded-only mono truncate text-[length:var(--text-mono-label-size)] uppercase tracking-[0.1em] text-paper/40">
            Business OS
          </span>
        </Link>
        {variant === "overlay" ? (
          <IconButton label="Close navigation" inverse onClick={() => setMobileNavOpen(false)}>
            <IconX size={16} />
          </IconButton>
        ) : null}
      </div>
      <nav aria-label="Workspace" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
        {groups.map((group) => (
          <div key={group.id} className="mt-4 first:mt-1">
            <p className="sidebar-expanded-only type-mono-label px-3 py-1 text-paper/40">{group.label}</p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.id}>
                  <NavItemLink item={item} collapsedVisual={collapsedVisual} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {variant === "persistent" ? (
        <div className="border-t border-paper/10 p-2">
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            aria-label={collapsedVisual ? "Expand sidebar" : "Collapse sidebar"}
            className="nav-item flex min-h-9 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-paper/70 hover:bg-paper/[0.04] hover:text-paper"
            aria-pressed={collapsedVisual}
          >
            <IconPanelLeft size={20} />
            <span className="sidebar-expanded-only type-label">
              {collapsedVisual ? "Expand" : "Collapse"}
            </span>
          </button>
        </div>
      ) : null}
    </>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, mobileNavOpen, setMobileNavOpen } = useWorkspaceShell();

  return (
    <>
      <aside
        data-surface="inverse"
        data-collapsed={sidebarCollapsed === null ? undefined : String(sidebarCollapsed)}
        aria-label="Workspace navigation"
        className="workspace-sidebar-persistent sticky top-0 hidden h-dvh shrink-0 flex-col bg-ink lg:flex"
      >
        <SidebarChrome variant="persistent" />
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-[var(--z-drawer)] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/50"
            aria-label="Dismiss navigation"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            data-surface="inverse"
            aria-label="Workspace navigation"
            className="relative flex h-full w-64 flex-col bg-ink shadow-[var(--elevation-drawer)]"
          >
            <SidebarChrome variant="overlay" onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  );
}

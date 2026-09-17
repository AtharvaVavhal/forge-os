"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { IconBell, IconMenu, IconSearch } from "@/components/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Breadcrumb } from "@/components/data-display/breadcrumb";
import { Popover } from "@/components/overlays/popover";
import { AccountMenu } from "@/features/auth/components/account-menu";
import { useAuthContext } from "@/features/auth/authorization/authorization-context";
import { NotificationsPopover } from "@/features/shared/components/notifications-ui";
import { listNotifications } from "@/features/shared/api/shared-api";
import { sharedKeys } from "@/features/shared/api/query-keys";
import { breadcrumbsFromPathname } from "./breadcrumbs";
import { useWorkspaceShell } from "./shell-context";

export function TopBar() {
  const pathname = usePathname();
  const { user } = useAuthContext();
  const { setCommandOpen, setMobileNavOpen } = useWorkspaceShell();
  const crumbs = breadcrumbsFromPathname(pathname);

  return (
    <header className="sticky top-0 z-[var(--z-topbar)] flex h-14 items-center gap-3 border-b border-steel/15 bg-paper-elev px-4 sm:px-6">
      <IconButton label="Open navigation" className="lg:hidden" onClick={() => setMobileNavOpen(true)}>
        <IconMenu size={20} />
      </IconButton>
      <Breadcrumb items={crumbs} className="min-w-0 flex-1" />
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="font-display hidden h-9 min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-steel/20 bg-paper px-3 text-[length:var(--text-body-small-size)] text-steel hover:border-steel/30 md:inline-flex"
        >
          <IconSearch size={16} />
          <span>Search…</span>
          <kbd className="mono ml-2 rounded border border-steel/20 px-1.5 py-0.5 text-[length:var(--text-mono-label-size)] tracking-normal text-steel">
            ⌘K
          </kbd>
        </button>
        <IconButton label="Open command palette" className="md:hidden" onClick={() => setCommandOpen(true)}>
          <IconSearch size={20} />
        </IconButton>
        <NotificationsTrigger />
        <AccountMenu user={user} />
      </div>
    </header>
  );
}

function NotificationsTrigger() {
  const query = useQuery({
    queryKey: sharedKeys.notifications.list({ limit: 8 }),
    queryFn: () => listNotifications({ limit: 8 }),
  });
  const hasUnread = Boolean(query.data?.items.some((item) => !item.readAt));

  return (
    <Popover
      widthClass="w-[22.5rem]"
      trigger={({ open, setOpen, panelId }) => (
        <IconButton
          label="Notifications"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="relative"
        >
          <IconBell size={20} />
          {hasUnread ? (
            <span
              data-testid="notifications-unread-dot"
              className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-ember-deep"
              aria-hidden="true"
            />
          ) : null}
        </IconButton>
      )}
    >
      <NotificationsPopover />
    </Popover>
  );
}

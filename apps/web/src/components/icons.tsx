import { cn } from "@/lib/cn";

const sizePx = { 16: 16, 20: 20, 24: 24 } as const;

export function Icon({
  children,
  size = 20,
  className,
  label,
}: {
  children: React.ReactNode;
  size?: keyof typeof sizePx;
  className?: string;
  label?: string;
}) {
  const px = sizePx[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {children}
    </svg>
  );
}

export function IconGrid(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Icon>
  );
}

export function IconUsers(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a3 3 0 0 1 0 5.74" />
    </Icon>
  );
}

export function IconBuilding(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
      <path d="M6 12h12" />
      <path d="M10 6h.01" />
      <path d="M14 6h.01" />
      <path d="M10 10h.01" />
      <path d="M14 10h.01" />
    </Icon>
  );
}

export function IconContact(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </Icon>
  );
}

export function IconHandshake(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M8 13 5 10l4-4 3 3" />
      <path d="m16 13 3-3-4-4-3 3" />
      <path d="M8 13v6" />
      <path d="M16 13v6" />
      <path d="M12 9v12" />
    </Icon>
  );
}

export function IconFolder(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </Icon>
  );
}

export function IconFlag(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M4 22V4" />
      <path d="M4 4h10l-1.5 4L14 12H4" />
    </Icon>
  );
}

export function IconCheckSquare(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M9 11 12 14l8-8" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </Icon>
  );
}

export function IconClock(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

export function IconInvoice(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M7 3h8l4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M15 3v4h4" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </Icon>
  );
}

export function IconCoins(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="14" r="5" />
      <path d="M12 6a5 5 0 1 1 4 8" />
    </Icon>
  );
}

export function IconReceipt(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M6 3h12v18l-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
    </Icon>
  );
}

export function IconLedger(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M4 5h16" />
      <path d="M4 12h16" />
      <path d="M4 19h16" />
      <path d="M8 5v14" />
    </Icon>
  );
}

export function IconActivity(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M4 12h4l2-6 4 12 2-6h4" />
    </Icon>
  );
}

export function IconSettings(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2" />
      <path d="M12 19v2" />
      <path d="M5 7.5 6.5 8.5" />
      <path d="M17.5 15.5 19 16.5" />
      <path d="M5 16.5 6.5 15.5" />
      <path d="M17.5 8.5 19 7.5" />
    </Icon>
  );
}

export function IconShield(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6Z" />
    </Icon>
  );
}

export function IconUser(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Icon>
  );
}

export function IconSearch(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

export function IconBell(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 7H4s2 0 2-7" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </Icon>
  );
}

export function IconMenu(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </Icon>
  );
}

export function IconPanelLeft(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </Icon>
  );
}

export function IconChevronLeft(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}

export function IconChevronRight(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  );
}

export function IconChevronDown(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function IconX(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </Icon>
  );
}

export function IconCheck(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="m5 12 5 5 9-10" />
    </Icon>
  );
}

export function IconMore(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <circle cx="6" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="18" cy="12" r="1" fill="currentColor" />
    </Icon>
  );
}

export function IconFileText(props: Omit<React.ComponentProps<typeof Icon>, "children">) {
  return (
    <Icon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </Icon>
  );
}

export const NAV_ICONS = {
  dashboard: IconGrid,
  leads: IconUsers,
  companies: IconBuilding,
  contacts: IconContact,
  deals: IconHandshake,
  projects: IconFolder,
  milestones: IconFlag,
  tasks: IconCheckSquare,
  timeEntries: IconClock,
  proposals: IconFileText,
  invoices: IconInvoice,
  payments: IconCoins,
  expenses: IconReceipt,
  forgeFund: IconLedger,
  members: IconUsers,
  workload: IconActivity,
  organization: IconSettings,
  roles: IconShield,
  auditLog: IconFileText,
  profile: IconUser,
} as const;

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const STORAGE_KEY = "forge.ui.sidebarCollapsed";

type SidebarPref = boolean | null;

const prefListeners = new Set<() => void>();

function readStoredPref(): SidebarPref {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    /* private mode */
  }
  return null;
}

function subscribePref(listener: () => void) {
  prefListeners.add(listener);
  return () => {
    prefListeners.delete(listener);
  };
}

function writePref(next: boolean) {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    /* ignore */
  }
  prefListeners.forEach((listener) => listener());
}

interface ShellContextValue {
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  /** null = follow CSS defaults (collapsed on laptop, expanded on desktop) */
  sidebarCollapsed: SidebarPref;
  toggleSidebarCollapsed: () => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function WorkspaceShellProvider({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const sidebarCollapsed = useSyncExternalStore(subscribePref, readStoredPref, () => null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const toggleSidebarCollapsed = useCallback(() => {
    const current = readStoredPref();
    const next =
      current !== null ? !current : window.matchMedia("(min-width: 1280px)").matches;
    writePref(next);
  }, []);

  const value = useMemo(
    () => ({
      mobileNavOpen,
      setMobileNavOpen,
      sidebarCollapsed,
      toggleSidebarCollapsed,
      commandOpen,
      setCommandOpen,
      notificationsOpen,
      setNotificationsOpen,
    }),
    [mobileNavOpen, sidebarCollapsed, toggleSidebarCollapsed, commandOpen, notificationsOpen]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useWorkspaceShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (!value) {
    throw new Error("useWorkspaceShell must be used within WorkspaceShellProvider");
  }
  return value;
}

/** Visual icon-rail detection for tooltips/labels only — width remains CSS-driven. */
export function useIconRail(): boolean {
  const { sidebarCollapsed } = useWorkspaceShell();
  const [cssCollapsed, setCssCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px) and (max-width: 1279px)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px) and (max-width: 1279px)");
    const apply = () => setCssCollapsed(media.matches);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  if (sidebarCollapsed === true) return true;
  if (sidebarCollapsed === false) return false;
  return cssCollapsed;
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ToastProvider, useToast } from "@/components/overlays/toast";
import { logoutPortal } from "../api/portal-api";
import { usePortalSession } from "../session/portal-session-context";

const NAV_ITEMS = [
  { href: "/portal", label: "Overview", exact: true },
  { href: "/portal/proposals", label: "Proposals", exact: false },
  { href: "/portal/projects", label: "Projects", exact: false },
  { href: "/portal/invoices", label: "Invoices", exact: false },
  { href: "/portal/documents", label: "Documents", exact: false },
  { href: "/portal/support", label: "Support", exact: false },
];

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <PortalShellInner>{children}</PortalShellInner>
    </ToastProvider>
  );
}

function PortalShellInner({ children }: { children: ReactNode }) {
  const { clientUser } = usePortalSession();
  const pathname = usePathname();
  const router = useRouter();
  const { pushToast } = useToast();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logoutPortal();
      router.push("/portal/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
      pushToast({
        title: "Sign-out failed",
        description: "Your session may still be active. Try again.",
        tone: "danger",
      });
    }
  };

  const isActive = (itemHref: string, exact: boolean) => {
    if (exact) return pathname === itemHref;
    return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--forge-paper,#faf8f5)] text-[var(--forge-ink,#1a1918)] antialiased font-sans">
      {/* Editorial Client Top Bar */}
      <header className="border-b border-[var(--forge-border,#e5dfd5)] bg-[var(--forge-paper,#faf8f5)] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link
              href="/portal"
              className="flex items-center gap-2.5 text-[var(--forge-ink,#1a1918)] no-underline hover:opacity-80 transition-opacity"
              data-testid="portal-brand-link"
            >
              <div className="w-8 h-8 rounded bg-[var(--forge-ink,#1a1918)] text-[var(--forge-paper,#faf8f5)] flex items-center justify-center font-bold text-sm tracking-widest font-mono">
                F
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-sm tracking-tight leading-none text-[var(--forge-ink,#1a1918)]">
                  FORGE
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--forge-ink-muted,#78736a)] mt-0.5">
                  Client Portal
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1" aria-label="Portal Navigation">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors no-underline ${
                      active
                        ? "bg-[var(--forge-border,#e5dfd5)] text-[var(--forge-ink,#1a1918)]"
                        : "text-[var(--forge-ink-muted,#78736a)] hover:text-[var(--forge-ink,#1a1918)] hover:bg-[var(--forge-border-subtle,#f0eae0)]"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Client Identity & Logout */}
          <div className="hidden md:flex items-center gap-4">
            <div className="text-right">
              {clientUser.company?.name && (
                <div className="text-sm font-medium text-[var(--forge-ink,#1a1918)] leading-tight" data-testid="portal-company-name">
                  {clientUser.company.name}
                </div>
              )}
              <div className="text-xs text-[var(--forge-ink-muted,#78736a)] font-mono leading-tight mt-0.5" data-testid="portal-user-email">
                {clientUser.email}
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleLogout}
              disabled={loggingOut}
              data-testid="portal-logout-button"
            >
              {loggingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation"
              data-testid="portal-mobile-menu-button"
            >
              {mobileMenuOpen ? "Close" : "Menu"}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[var(--forge-border,#e5dfd5)] bg-[var(--forge-paper,#faf8f5)] px-4 py-3 space-y-2">
            <div className="pb-2 border-b border-[var(--forge-border-subtle,#f0eae0)]">
              {clientUser.company?.name && (
                <div className="text-sm font-semibold text-[var(--forge-ink,#1a1918)]">
                  {clientUser.company.name}
                </div>
              )}
              <div className="text-xs text-[var(--forge-ink-muted,#78736a)] font-mono">
                {clientUser.email}
              </div>
            </div>

            <div className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-3 py-2 rounded-md text-sm font-medium no-underline ${
                      active
                        ? "bg-[var(--forge-border,#e5dfd5)] text-[var(--forge-ink,#1a1918)]"
                        : "text-[var(--forge-ink-muted,#78736a)] hover:text-[var(--forge-ink,#1a1918)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="pt-2 border-t border-[var(--forge-border-subtle,#f0eae0)]">
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-center"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? "Signing out…" : "Sign out"}
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8" id="portal-main-content">
        {children}
      </main>

      {/* Editorial Footer */}
      <footer className="border-t border-[var(--forge-border,#e5dfd5)] py-6 text-center text-xs text-[var(--forge-ink-muted,#78736a)]">
        <div className="max-w-7xl mx-auto px-4">
          Forge Client Portal &bull; Company Documents &amp; Workflow
        </div>
      </footer>
    </div>
  );
}

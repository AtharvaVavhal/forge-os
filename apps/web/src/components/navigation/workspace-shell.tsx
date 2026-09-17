"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/overlays/toast";
import { CommandPalette } from "./command-palette";
import { Sidebar } from "./sidebar";
import { WorkspaceShellProvider } from "./shell-context";
import { TopBar } from "./top-bar";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShellProvider>
      <ToastProvider>
        <div className="min-h-dvh bg-paper text-ink">
          <a
            href="#workspace-main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-paper-elev focus:px-3 focus:py-2"
          >
            Skip to main content
          </a>
          <div className="flex min-h-dvh">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar />
              <main id="workspace-main" className="flex-1 px-[var(--space-page-x)] py-6">
                {children}
              </main>
            </div>
          </div>
          <CommandPalette />
        </div>
      </ToastProvider>
    </WorkspaceShellProvider>
  );
}

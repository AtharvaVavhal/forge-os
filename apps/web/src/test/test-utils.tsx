import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { AuthorizationProvider } from "@/features/auth/authorization/authorization-context";
import { WorkspaceShellProvider } from "@/components/navigation/shell-context";
import { ToastProvider } from "@/components/overlays/toast";
import type { InternalAuthContext } from "@/features/auth/types";
import { PortalSessionProvider } from "@/features/portal/session/portal-session-context";
import type { PortalAuthContext, PortalClientUser } from "@/features/portal/types";
import type { UserRole } from "@forge/types";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

export function renderWithQuery(ui: ReactElement) {
  const queryClient = createQueryClient();
  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  };
}

export function createAuthContext(overrides?: {
  role?: UserRole;
  permissions?: string[] | undefined;
  active?: boolean;
}): InternalAuthContext {
  return {
    user: {
      id: "user-1",
      organizationId: "org-1",
      email: "atharva@forgebuilds.in",
      name: "Atharva",
      role: overrides?.role ?? "TEAM_MEMBER",
      active: overrides?.active ?? true,
    },
    permissions: overrides?.permissions,
  };
}

export function renderWithAuth(ui: ReactElement, context: InternalAuthContext = createAuthContext()) {
  const queryClient = createQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthorizationProvider value={context}>{children}</AuthorizationProvider>
      </QueryClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}

export function renderWithShell(ui: ReactElement, context: InternalAuthContext = createAuthContext()) {
  const queryClient = createQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthorizationProvider value={context}>
          <WorkspaceShellProvider>
            <ToastProvider>{children}</ToastProvider>
          </WorkspaceShellProvider>
        </AuthorizationProvider>
      </QueryClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}

export function createPortalAuthContext(overrides?: Partial<PortalClientUser>): PortalAuthContext {
  return {
    clientUser: {
      id: overrides?.id ?? "client-user-1",
      organizationId: overrides?.organizationId ?? "org-1",
      companyId: overrides?.companyId ?? "company-1",
      contactId: overrides?.contactId ?? "contact-1",
      email: overrides?.email ?? "client@acme.corp",
      active: overrides?.active ?? true,
      lastLoginAt: overrides?.lastLoginAt ?? "2026-09-17T12:00:00Z",
      createdAt: overrides?.createdAt ?? "2026-09-01T12:00:00Z",
      company: overrides?.company ?? { id: "company-1", name: "Acme Corporation" },
      contact: overrides?.contact ?? { id: "contact-1", name: "John Doe" },
    },
  };
}

export function renderWithPortal(
  ui: ReactElement,
  context: PortalAuthContext = createPortalAuthContext()
) {
  const queryClient = createQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <PortalSessionProvider value={context}>
          <ToastProvider>{children}</ToastProvider>
        </PortalSessionProvider>
      </QueryClientProvider>
    );
  }
  return {
    queryClient,
    ...render(ui, { wrapper: Wrapper }),
  };
}


import { PortalSessionProvider } from "@/features/portal/session/portal-session-context";
import { requirePortalSession } from "@/features/portal/session/require-portal-session";
import { PortalShell } from "@/features/portal/components/portal-shell";

export const dynamic = "force-dynamic";

/**
 * Authenticated Client Portal Layout.
 * Requires an active ClientUser portal session (portal_session cookie + GET /portal/me).
 * Isolates the portal plane from internal workspace authentication.
 */
export default async function PortalWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePortalSession();

  return (
    <PortalSessionProvider value={session}>
      <PortalShell>{children}</PortalShell>
    </PortalSessionProvider>
  );
}

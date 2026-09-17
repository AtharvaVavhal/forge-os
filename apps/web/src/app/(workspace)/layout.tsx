import { AuthorizationProvider } from "@/features/auth/authorization/authorization-context";
import { requireWorkspaceSession } from "@/features/auth/session/require-workspace-session";
import { WorkspaceShell } from "@/components/navigation/workspace-shell";

export const dynamic = "force-dynamic";

/**
 * Authenticated workspace boundary (Doc B3 §1 / §4).
 * Session is checked server-side before the shell streams. This is a UX
 * convenience — every subsequent API call is still authorized by the backend.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireWorkspaceSession();

  return (
    <AuthorizationProvider value={session}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </AuthorizationProvider>
  );
}

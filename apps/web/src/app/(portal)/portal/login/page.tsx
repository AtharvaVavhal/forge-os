import { PortalLoginPage } from "@/features/portal/components/portal-login-page";
import { redirectIfPortalAuthenticated } from "@/features/portal/session/require-portal-session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  await redirectIfPortalAuthenticated("/portal");
  return <PortalLoginPage />;
}

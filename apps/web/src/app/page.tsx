import { redirect } from "next/navigation";

/**
 * Phase 0 has no session to check, so this just points `/` at the
 * workspace shell placeholder. Once Phase 1 auth exists, this becomes a
 * real redirect to /login or /dashboard depending on session state.
 */
export default function RootPage() {
  redirect("/dashboard");
}

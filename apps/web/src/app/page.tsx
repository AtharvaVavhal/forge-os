import { redirect } from "next/navigation";
import { readAuthContext } from "@/features/auth/session/read-session";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const result = await readAuthContext();
  if (result.status === "authenticated") {
    redirect("/dashboard");
  }
  redirect("/login");
}

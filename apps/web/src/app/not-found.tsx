import { ForbiddenState } from "@/features/auth/components/forbidden-state";

/**
 * Deliberately does not distinguish "doesn't exist" from "exists but you
 * don't have access" (Doc B3 §4, Document 6 §3.2).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-lg">
        <ForbiddenState />
      </div>
    </div>
  );
}

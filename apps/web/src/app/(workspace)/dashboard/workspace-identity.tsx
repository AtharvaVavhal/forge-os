"use client";

import { useAuthorization } from "@/features/auth/authorization/authorization-context";

export function WorkspaceIdentity() {
  const { user, role, permissions } = useAuthorization();

  return (
    <dl className="grid gap-4 border-t border-steel/15 pt-6 sm:grid-cols-2">
      <div>
        <dt className="mono text-[length:var(--text-mono-label-size)] uppercase tracking-[0.08em] text-steel">
          Signed in as
        </dt>
        <dd className="font-display mt-1 text-[length:var(--text-body-size)] font-semibold text-ink">{user.name}</dd>
        <dd className="font-display text-[length:var(--text-body-small-size)] text-steel">{user.email}</dd>
      </div>
      <div>
        <dt className="mono text-[length:var(--text-mono-label-size)] uppercase tracking-[0.08em] text-steel">Role</dt>
        <dd className="mono mt-1 text-[length:var(--text-metadata-size)] tracking-[0.02em] text-ink">
          {role.replaceAll("_", " ")}
        </dd>
        <dd className="font-display mt-1 text-[length:var(--text-helper-size)] text-steel">
          {permissions
            ? `${permissions.length} permission${permissions.length === 1 ? "" : "s"} from the server`
            : "Permissions will appear here once the backend includes them on the session."}
        </dd>
      </div>
    </dl>
  );
}

"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/data-display/table";
import { PageHeader } from "@/features/crm/components/page-chrome";
import { enumLabel } from "@/features/crm/format";
import { USER_ROLES, type UserRole } from "@forge/types";

/**
 * Read-only reference of the frozen UserRole enum and Document 5 §4.3 defaults.
 * Not a permission-matrix editor — there is no Role table or PATCH /users/:id.
 */
const CATALOG: Array<{ permission: string; roles: readonly UserRole[] }> = [
  { permission: "users.*", roles: ["FOUNDER_ADMIN"] },
  { permission: "crm.read", roles: ["FOUNDER_ADMIN", "OPERATIONS", "FINANCE", "SALES"] },
  { permission: "crm.manage", roles: ["FOUNDER_ADMIN", "SALES"] },
  { permission: "sales.read", roles: ["FOUNDER_ADMIN", "OPERATIONS", "FINANCE", "SALES"] },
  { permission: "sales.manage", roles: ["FOUNDER_ADMIN", "SALES"] },
  { permission: "projects.read", roles: ["FOUNDER_ADMIN", "OPERATIONS", "FINANCE", "SALES"] },
  { permission: "projects.manage", roles: ["FOUNDER_ADMIN", "OPERATIONS"] },
  { permission: "finance.read", roles: ["FOUNDER_ADMIN", "FINANCE"] },
  { permission: "finance.manage", roles: ["FOUNDER_ADMIN", "FINANCE"] },
  { permission: "forge_fund.read", roles: ["FOUNDER_ADMIN", "FINANCE"] },
  { permission: "forge_fund.manage", roles: ["FOUNDER_ADMIN", "FINANCE"] },
  { permission: "forge_fund.approve", roles: ["FOUNDER_ADMIN", "FINANCE"] },
  { permission: "documents.manage", roles: ["FOUNDER_ADMIN", "OPERATIONS", "FINANCE", "SALES"] },
  { permission: "audit.read", roles: ["FOUNDER_ADMIN", "FINANCE"] },
  { permission: "portal.manage", roles: ["FOUNDER_ADMIN", "SALES"] },
  { permission: "team.workload.read", roles: ["FOUNDER_ADMIN", "OPERATIONS"] },
];

export function RolesReferencePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Settings"
        title="Roles"
        description="Frozen UserRole enum. Typical defaults from Document 5. Session permissions from GET /auth/me remain authoritative. This is not an editor."
      />
      <Table caption="Typical role defaults">
        <TableHead>
          <TableHeaderCell>Permission</TableHeaderCell>
          {USER_ROLES.map((role) => (
            <TableHeaderCell key={role}>{enumLabel(role)}</TableHeaderCell>
          ))}
        </TableHead>
        <TableBody>
          {CATALOG.map((row) => (
            <TableRow key={row.permission}>
              <TableCell mono>{row.permission}</TableCell>
              {USER_ROLES.map((role) => (
                <TableCell key={role}>{row.roles.includes(role) ? "Yes" : "—"}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="type-helper text-steel">
        TEAM_MEMBER scope is assignment-limited on the backend (own tasks / assigned projects). There is
        no Role builder and no payout permission.
      </p>
    </div>
  );
}

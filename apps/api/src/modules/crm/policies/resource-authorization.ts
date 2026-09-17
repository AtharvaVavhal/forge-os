import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";

/**
 * Step 11 "resource authorization foundation" — the row-level narrowing
 * `permissions.ts` anticipated for roles the flat permission grant marks
 * "limited"/"assigned" (Document 5 §4.3 footnotes). This is the first
 * phase with real resources to apply it against.
 *
 * ── Companies / Contacts — TEAM_MEMBER (Document 5 §4.3 footnote ¹ /
 * Document 6 §2.3 footnote ³): "linked to assigned projects only." B2
 * does not implement Projects/Task assignment (that's B4) — there is
 * currently no mechanism by which a company/contact could be "linked to
 * an assigned project." Rather than either (a) silently granting
 * TEAM_MEMBER unrestricted access, which violates the frozen "limited"
 * scope, or (b) inventing project-assignment logic that doesn't exist
 * yet, this fails closed: TEAM_MEMBER sees an empty list and a 403 on any
 * specific company/contact, until B4 gives this a real scope to compute.
 * Documented as a forward-looking limitation, not a bug.
 *
 * ── Leads / Deals — Document 6 §2.3's matrix marks these "—" (denied)
 * for TEAM_MEMBER, not "L" (limited) — unlike Companies/Contacts, the
 * TEAM_MEMBER row for Leads/Deals has no footnote describing *any*
 * visible subset. Document 5 §4.3's footnote ¹ text itself only ever
 * says "companies/contacts," never leads/deals, so the two documents
 * agree once read precisely: TEAM_MEMBER's coarse `crm.read` permission
 * grant (needed so Companies/Contacts routes are reachable at all) does
 * NOT extend to Leads/Deals, which are fully denied for this role.
 */
export function assertCrmRoleMayAccessLeadsOrDeals(actor: AuthenticatedUser): void {
  if (actor.role === UserRole.TEAM_MEMBER) {
    throw new ForbiddenException({
      code: "FORBIDDEN_PERMISSION",
      message: "You don't have permission to do this.",
    });
  }
}

/**
 * Companies/Contacts: TEAM_MEMBER's scope currently resolves to nothing
 * (see class doc above). Used as a Prisma `where` fragment for LIST
 * (returns zero rows) — an impossible condition, not a permission error,
 * since the *route* is legitimately reachable (crm.read is granted).
 */
export function teamMemberScopedCompanyContactWhere(actor: AuthenticatedUser): Record<string, unknown> | undefined {
  if (actor.role !== UserRole.TEAM_MEMBER) return undefined;
  return { id: { in: [] as string[] } };
}

/** Companies/Contacts: TEAM_MEMBER GET-by-id — always out of scope today (see class doc above). */
export function assertTeamMemberMayViewCompanyOrContact(actor: AuthenticatedUser): void {
  if (actor.role === UserRole.TEAM_MEMBER) {
    throw new ForbiddenException({
      code: "FORBIDDEN_PERMISSION",
      message: "You don't have permission to do this.",
    });
  }
}

/**
 * Activities — Document 6 §2.3: FOUNDER_ADMIN/OPERATIONS/FINANCE/SALES
 * all get full C/R; TEAM_MEMBER is "L⁴" (assigned project owner or task
 * assignee scope). Document 5 §4.2 has no dedicated `activities.*`
 * permission, and OPERATIONS/FINANCE hold `crm.read` but not
 * `crm.manage` — so gating Activity *create* on `crm.manage` would wrongly
 * exclude two roles Document 6 explicitly grants it to. This lists the
 * exact role set Document 6's matrix names for Activities, independent of
 * the coarser crm.* grants.
 */
const ACTIVITY_CREATOR_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.FOUNDER_ADMIN,
  UserRole.OPERATIONS,
  UserRole.FINANCE,
  UserRole.SALES,
]);

export function assertCanCreateActivity(actor: AuthenticatedUser): void {
  if (!ACTIVITY_CREATOR_ROLES.has(actor.role)) {
    throw new ForbiddenException({
      code: "FORBIDDEN_PERMISSION",
      message: "You don't have permission to do this.",
    });
  }
}

/** Activities LIST: TEAM_MEMBER's assigned-scope is currently empty (same reasoning as Companies/Contacts). */
export function teamMemberScopedActivityWhere(actor: AuthenticatedUser): Record<string, unknown> | undefined {
  if (actor.role !== UserRole.TEAM_MEMBER) return undefined;
  return { id: { in: [] as string[] } };
}

import { Injectable, Logger } from "@nestjs/common";
import type { ActorType } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

export interface RecordAuditEventInput {
  organizationId: string;
  actorType: ActorType;
  /** Null only for `actorType: 'SYSTEM'` (Document 2 — AuditLog.actor_id). */
  actorId: string | null;
  /** e.g. "auth.login_succeeded" — see AUDIT_ACTIONS below for the set this module emits. */
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
}

/**
 * The one place this codebase writes to `audit_logs`. Deliberately thin —
 * `shared` owns `Activity`/`Note`/`Document`/`Notification`/`AuditLog`/
 * `DomainEvent` per Document 5 §1, and Phase 1 only needs the AuditLog
 * slice of that (auth/RBAC/invitation/password-reset events, per
 * Document 6 §17's Tier A/B list). The rest of `shared` is out of scope
 * until the modules that need it exist.
 *
 * `AuditLog` is genuinely append-only at the database level (`REVOKE
 * UPDATE, DELETE ON audit_logs FROM forge_app`, applied in the Phase 0/
 * Document 4 migration) — this service only ever calls `.create()`, never
 * `.update()`/`.delete()`, and a Postgres grant makes that the actual
 * enforcement, not just application discipline (Document 6 §17).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organization_id: input.organizationId,
          actor_type: input.actorType,
          actor_id: input.actorId,
          action: input.action,
          entity_type: input.entityType,
          entity_id: input.entityId,
          before: input.before === undefined ? undefined : (input.before as object),
          after: input.after === undefined ? undefined : (input.after as object),
          ip_address: input.ipAddress,
        },
      });
    } catch (error) {
      // An audit-write failure must never take down the request that
      // triggered it (e.g. a successful login shouldn't 500 because the
      // audit insert had a transient hiccup) — but it must be loud in the
      // logs, since a silently-dropped Tier A audit event is itself a
      // security-relevant gap (Document 6 §17).
      this.logger.error(
        `Failed to record audit event "${input.action}" for ${input.entityType}:${input.entityId}`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }
}

/**
 * The specific action strings this module emits, named consistently
 * (`auth.*`, `invitation.*`) — kept here as a single source rather than
 * inline string literals scattered across services, so a future audit
 * query/report has one place to see the exhausted list.
 */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCEEDED: "auth.login_succeeded",
  LOGIN_FAILED: "auth.login_failed",
  LOGIN_REJECTED_INACTIVE: "auth.login_rejected_inactive",
  LOGOUT: "auth.logout",
  SSO_LOGIN_SUCCEEDED: "auth.sso_login_succeeded",
  SSO_LOGIN_REJECTED_NO_MATCH: "auth.sso_login_rejected_no_match",
  PASSWORD_RESET_REQUESTED: "auth.password_reset_requested",
  PASSWORD_RESET_COMPLETED: "auth.password_reset_completed",
  PASSWORD_RESET_REPLAY_REJECTED: "auth.password_reset_replay_rejected",
  INVITATION_CREATED: "invitation.created",
  INVITATION_REVOKED: "invitation.revoked",
  INVITATION_ACCEPTED: "invitation.accepted",
  INVITATION_ACCEPT_REJECTED: "invitation.accept_rejected",
  // B2 CRM (Document 5 §12.1/§12.2 "Audit" columns; Document 6 §17 Tier A).
  LEAD_TRANSITIONED: "lead.transitioned",
  LEAD_CONVERTED: "lead.converted",
  DEAL_TRANSITIONED: "deal.transitioned",
  DEAL_REOPENED: "deal.reopened",
  DEAL_BULK_REASSIGNED: "deal.bulk_reassigned",
  // B3 Sales/Proposals (Document 5 §12.3 "Audit all transitions (A)"; §19's
  // per-route Audit column for send/revise/transition).
  PROPOSAL_SENT: "proposal.sent",
  PROPOSAL_TRANSITIONED: "proposal.transitioned",
  PROPOSAL_REVISED: "proposal.revised",
  // B4 Projects (Document 5 §12.4, §19's per-route Audit column).
  PROJECT_STATUS_CHANGED: "project.status_changed",
  PROJECT_PHASE_CHANGED: "project.phase_changed",
  PROJECT_PHASE_OVERRIDDEN: "project.phase_overridden",
  PROJECT_HANDOVER_ITEM_COMPLETED: "project.handover_item_completed",
  PROJECT_COMPLETED: "project.completed",
  MILESTONE_TRANSITIONED: "milestone.transitioned",
  MILESTONE_REVERTED: "milestone.reverted",
  TASK_ASSIGNED: "task.assigned",
  TASK_REOPENED: "task.reopened",
} as const;

/**
 * NOT IMPLEMENTED — documented gap, not a silent omission.
 *
 * Document 6 §2.3's RBAC matrix lists "Users | U (role/active) |
 * FOUNDER_ADMIN only" as a frozen capability (a role or active-flag
 * change on a User). Document 5 §3.2 and §19's Auth endpoint inventory —
 * the frozen list Step 16 restricts this phase to — does not expose any
 * concrete route for it (no `PATCH /users/:id`, no `/users` endpoints at
 * all). Building one now would be inventing a business endpoint beyond
 * Document 5's frozen list, which Step 16 explicitly forbids. This gap
 * between Document 5 and Document 6 is carried forward as an open
 * decision (see docs/IMPLEMENTATION-PHASE-1.md) rather than resolved
 * unilaterally in either direction.
 */

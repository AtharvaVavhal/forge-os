import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ForgeFundEntryType, Prisma, type ForgeFundEntry } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, offsetSkipTake, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import { roleHasPermission } from "../../auth/policies/permissions";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type { CreateForgeFundEntryDto, ListForgeFundEntriesQueryDto } from "../dto/forge-fund.dto";

/**
 * Document 5 §8.4 / task section 11 — append-only ledger, `ForgeFundEntry`
 * only. No TeamPayout/Payout/MemberBalance/Allocation table, no
 * hard-coded 60/40 split. Manual entries here always have `source_type =
 * null, source_id = null` (`CreateForgeFundEntryDto` structurally forbids
 * anything else — see the DTO's own doc comment); automatic, source-
 * linked CONTRIBUTION entries are created only by `RazorpayService`
 * inside the webhook transaction, never through this service.
 */
@Injectable()
export class ForgeFundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(actor: AuthenticatedUser, query: ListForgeFundEntriesQueryDto): Promise<ListEnvelope<ForgeFundEntry>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sortDirection = (query.sort ?? "createdAt:desc").endsWith(":asc") ? "asc" : "desc";
    const where: Prisma.ForgeFundEntryWhereInput = { organization_id: actor.organizationId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.forgeFundEntry.findMany({
        where,
        orderBy: { created_at: sortDirection },
        ...offsetSkipTake(page, pageSize),
      }),
      this.prisma.forgeFundEntry.count({ where }),
    ]);

    return { data, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<ForgeFundEntry> {
    const entry = await this.prisma.forgeFundEntry.findFirst({
      where: { id, organization_id: actor.organizationId },
    });
    if (!entry) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Forge Fund entry not found." });
    }
    return entry;
  }

  /** `GET /forge-fund/balance` — Document 5 §8.4: "{balance} | SUM." */
  async balance(actor: AuthenticatedUser): Promise<{ balance: string }> {
    const result = await this.prisma.forgeFundEntry.aggregate({
      where: { organization_id: actor.organizationId },
      _sum: { amount: true },
    });
    return { balance: (result._sum.amount ?? new Prisma.Decimal(0)).toFixed(2) };
  }

  /**
   * `POST /forge-fund-entries` — `forge_fund.manage` + `forge_fund.approve`
   * (both required — enforced by the controller's `@RequirePermissions`).
   * Document 2's stored-value sign convention (positive CONTRIBUTION,
   * negative WITHDRAWAL/ALLOCATION) is applied here from the client's
   * always-positive input magnitude — see forge-fund.dto.ts. `approved_by`
   * is the acting user (the act of creating the entry *is* the approval —
   * Document 5 §8.4: "No draft/approve/paid payout state machine —
   * approval is the act of creating the entry with approved_by + audit").
   * Tier A audit.
   */
  async create(actor: AuthenticatedUser, dto: CreateForgeFundEntryDto): Promise<ForgeFundEntry> {
    // Document 5 §8.4: "POST /forge-fund-entries | forge_fund.manage +
    // forge_fund.approve" — genuinely both required, not either/or. The
    // shared global `PermissionsGuard`/`@RequirePermissions` is an "any
    // of" check (matching every other route in this codebase, which only
    // ever needs one permission) — the controller's decorator handles
    // baseline reachability (`forge_fund.manage`); this is the resource-
    // authorization layer (same pattern as B2's
    // `InvitationService.assertCanManageInvitations`) enforcing the
    // second, AND-combined permission precisely.
    if (!roleHasPermission(actor.role, "forge_fund.approve")) {
      throw new ForbiddenException({
        code: "FORBIDDEN_PERMISSION",
        message: "You don't have permission to do this.",
      });
    }

    const magnitude = new Prisma.Decimal(dto.amount);
    const signedAmount = dto.type === ForgeFundEntryType.CONTRIBUTION ? magnitude : magnitude.negated();

    const entry = await this.prisma.forgeFundEntry.create({
      data: {
        organization_id: actor.organizationId,
        type: dto.type,
        amount: signedAmount,
        source_type: null,
        source_id: null,
        reason: dto.reason,
        approved_by: actor.id,
      },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.FORGE_FUND_ENTRY_CREATED,
      entityType: "ForgeFundEntry",
      entityId: entry.id,
      after: { type: dto.type, amount: signedAmount.toString(), reason: dto.reason },
    });

    return entry;
  }
}

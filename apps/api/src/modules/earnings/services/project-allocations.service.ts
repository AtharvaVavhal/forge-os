import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ActorType, Prisma, ProjectAllocationStatus, type ProjectAllocation } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, offsetSkipTake, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import { AuditService } from "../../shared/audit.service";
import { EARNINGS_AUDIT_ACTIONS } from "./earnings-audit-actions";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import {
  CreateProjectAllocationDto,
  ListProjectAllocationsQueryDto,
  ProjectAllocationLineInputDto,
  ReplaceProjectAllocationLinesDto,
} from "../dto/project-allocation.dto";
import { assertProjectInOrg, assertUserInOrgAndActive } from "./scope-guards";
import { assertValidProjectAllocationTransition, isProjectAllocationEditable } from "../policies/project-allocation-state-machine";
import { ProjectFinancialsService } from "./project-financials.service";
import {
  toProjectAllocationAuditSnapshot,
  toProjectAllocationListItem,
  toProjectAllocationView,
  type ProjectAllocationListItem,
  type ProjectAllocationView,
} from "../views/project-allocation-views";

const DETAIL_INCLUDE = {
  project: { select: { name: true } },
  creator: { select: { id: true, name: true, email: true } },
  approver: { select: { id: true, name: true, email: true } },
  lines: { include: { user: { select: { name: true, email: true } } }, orderBy: { created_at: "asc" as const } },
};

type AllocationDetail = ProjectAllocation & {
  project: { name: string };
  creator: { id: string; name: string; email: string };
  approver: { id: string; name: string; email: string } | null;
  lines: Prisma.ProjectAllocationLineGetPayload<{ include: { user: { select: { name: true; email: true } } } }>[];
};

@Injectable()
export class ProjectAllocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly financials: ProjectFinancialsService
  ) {}

  async list(actor: AuthenticatedUser, query: ListProjectAllocationsQueryDto): Promise<ListEnvelope<ProjectAllocationListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.ProjectAllocationWhereInput = {
      organization_id: actor.organizationId,
      ...(query.projectId ? { project_id: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.projectAllocation.findMany({
        where,
        include: { project: { select: { name: true } } },
        orderBy: { created_at: "desc" },
        ...offsetSkipTake(page, pageSize),
      }),
      this.prisma.projectAllocation.count({ where }),
    ]);

    return {
      data: rows.map(toProjectAllocationListItem),
      meta: { pagination: buildOffsetMeta(page, pageSize, total) },
    };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<ProjectAllocationView> {
    const allocation = await this.findOrgAllocationOrThrow(actor, id);
    const [live, cumulative] = await Promise.all([
      this.liveFinancials(actor.organizationId, allocation.project_id),
      this.financials.computeCumulativeApprovedAllocated(this.prisma, actor.organizationId, allocation.project_id),
    ]);
    return toProjectAllocationView(allocation, live, cumulative);
  }

  async create(actor: AuthenticatedUser, dto: CreateProjectAllocationDto): Promise<ProjectAllocationView> {
    await assertProjectInOrg(this.prisma, dto.projectId, actor.organizationId);
    const lines = dto.lines ?? [];
    this.assertNoDuplicateLines(lines);
    for (const line of lines) {
      await assertUserInOrgAndActive(this.prisma, line.userId, actor.organizationId);
      this.assertLineSign(line.amount, false);
    }
    const totalAllocated = this.sumLines(lines);

    const created = await this.prisma.$transaction(async (tx) => {
      const allocation = await tx.projectAllocation.create({
        data: {
          organization_id: actor.organizationId,
          project_id: dto.projectId,
          status: ProjectAllocationStatus.DRAFT,
          created_by: actor.id,
          total_allocated: totalAllocated,
        },
      });
      if (lines.length > 0) {
        await this.createLines(tx, actor.organizationId, allocation.id, lines);
      }
      return allocation;
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: ActorType.USER,
      actorId: actor.id,
      action: EARNINGS_AUDIT_ACTIONS.PROJECT_ALLOCATION_CREATED,
      entityType: "ProjectAllocation",
      entityId: created.id,
      after: toProjectAllocationAuditSnapshot({
        id: created.id,
        projectId: created.project_id,
        status: created.status,
        totalAllocated: created.total_allocated.toFixed(2),
        adjustmentOfId: created.adjustment_of_id,
      }),
    });

    return this.get(actor, created.id);
  }

  /** `PATCH /project-allocations/:id/lines` — full replace, version-guarded. Advisory pool check only; approve() is authoritative. */
  async replaceLines(
    actor: AuthenticatedUser,
    id: string,
    dto: ReplaceProjectAllocationLinesDto
  ): Promise<ProjectAllocationView> {
    this.assertNoDuplicateLines(dto.lines);
    const existing = await this.findOrgAllocationOrThrow(actor, id);
    if (!isProjectAllocationEditable(existing.status)) {
      throw new ConflictException({
        code: "PROJECT_ALLOCATION_NOT_EDITABLE",
        message: `Allocation in status ${existing.status} cannot be edited.`,
      });
    }
    const isAdjustment = existing.adjustment_of_id !== null;
    for (const line of dto.lines) {
      await assertUserInOrgAndActive(this.prisma, line.userId, actor.organizationId);
      this.assertLineSign(line.amount, isAdjustment);
    }
    const totalAllocated = this.sumLines(dto.lines);

    const distributable = await this.financials.computeDistributable(this.prisma, actor.organizationId, existing.project_id);
    const cumulativeOthers = await this.financials.computeCumulativeApprovedAllocated(
      this.prisma,
      actor.organizationId,
      existing.project_id
    );
    if (cumulativeOthers.plus(totalAllocated).greaterThan(distributable)) {
      throw new UnprocessableEntityException({
        code: "ALLOCATION_EXCEEDS_DISTRIBUTABLE_POOL",
        message: "This allocation would exceed the project's distributable pool.",
        details: {
          distributable: distributable.toFixed(2),
          otherApprovedTotal: cumulativeOthers.toFixed(2),
          thisRoundTotal: totalAllocated.toFixed(2),
        },
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.projectAllocation.updateMany({
        where: { id, organization_id: actor.organizationId, status: ProjectAllocationStatus.DRAFT, version: dto.version },
        data: { total_allocated: totalAllocated, version: { increment: 1 } },
      });
      if (result.count !== 1) {
        throw new ConflictException({
          code: "PROJECT_ALLOCATION_VERSION_CONFLICT",
          message: "This allocation was changed by someone else. Reload and try again.",
        });
      }
      await tx.projectAllocationLine.deleteMany({ where: { project_allocation_id: id } });
      if (dto.lines.length > 0) {
        await this.createLines(tx, actor.organizationId, id, dto.lines);
      }
      return tx.projectAllocation.findUniqueOrThrow({ where: { id } });
    });

    return this.get(actor, updated.id);
  }

  /**
   * `POST /project-allocations/:id/approve` — the authoritative gate.
   * Locks the Project row, recomputes live revenue/expenses/distributable,
   * sums every prior APPROVED round's total for this project, validates the
   * cumulative invariant, freezes the three snapshots, and flips status —
   * all inside one transaction. This is a cross-row invariant (spans every
   * ProjectAllocation for the project), so it cannot be a DB CHECK
   * constraint; the Project-row lock is what makes it safe under
   * concurrent approvals for the same project.
   */
  async approve(actor: AuthenticatedUser, id: string, dto: { version: number }): Promise<ProjectAllocationView> {
    const preCheck = await this.findOrgAllocationOrThrow(actor, id);
    assertValidProjectAllocationTransition(preCheck.status, ProjectAllocationStatus.APPROVED);

    const approved = await this.prisma.$transaction(async (tx) => {
      const lockedProjects = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM projects
        WHERE id = ${preCheck.project_id}::uuid AND organization_id = ${actor.organizationId}::uuid
        FOR UPDATE
      `;
      if (!lockedProjects[0]) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found." });
      }

      const current = await tx.projectAllocation.findFirst({
        where: { id, organization_id: actor.organizationId },
      });
      if (!current) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Allocation not found." });
      }
      assertValidProjectAllocationTransition(current.status, ProjectAllocationStatus.APPROVED);
      if (current.version !== dto.version) {
        throw new ConflictException({
          code: "PROJECT_ALLOCATION_VERSION_CONFLICT",
          message: "This allocation was changed by someone else. Reload and try again.",
        });
      }

      const revenue = await this.financials.computeRevenue(tx, actor.organizationId, preCheck.project_id);
      const expenses = await this.financials.computeExpenses(tx, actor.organizationId, preCheck.project_id);
      const rawDistributable = revenue.minus(expenses);
      const distributable = rawDistributable.isNegative() ? new Prisma.Decimal(0) : rawDistributable;

      const priorApprovedTotal = await this.financials.computeCumulativeApprovedAllocated(
        tx,
        actor.organizationId,
        preCheck.project_id
      );

      const cumulativeIfApproved = priorApprovedTotal.plus(current.total_allocated);
      if (cumulativeIfApproved.greaterThan(distributable)) {
        throw new UnprocessableEntityException({
          code: "ALLOCATION_EXCEEDS_DISTRIBUTABLE_POOL",
          message: "Approving this allocation would exceed the project's current distributable pool.",
          details: {
            distributable: distributable.toFixed(2),
            priorApprovedTotal: priorApprovedTotal.toFixed(2),
            thisRoundTotal: current.total_allocated.toFixed(2),
          },
        });
      }

      return tx.projectAllocation.update({
        where: { id },
        data: {
          status: ProjectAllocationStatus.APPROVED,
          revenue_snapshot: revenue,
          expenses_snapshot: expenses,
          distributable_snapshot: distributable,
          approved_by: actor.id,
          approved_at: new Date(),
          version: { increment: 1 },
        },
      });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: ActorType.USER,
      actorId: actor.id,
      action: approved.adjustment_of_id
        ? EARNINGS_AUDIT_ACTIONS.PROJECT_ALLOCATION_ADJUSTED
        : EARNINGS_AUDIT_ACTIONS.PROJECT_ALLOCATION_APPROVED,
      entityType: "ProjectAllocation",
      entityId: approved.id,
      after: toProjectAllocationAuditSnapshot({
        id: approved.id,
        projectId: approved.project_id,
        status: approved.status,
        totalAllocated: approved.total_allocated.toFixed(2),
        adjustmentOfId: approved.adjustment_of_id,
      }),
    });

    return this.get(actor, approved.id);
  }

  async cancel(actor: AuthenticatedUser, id: string, dto: { version: number }): Promise<ProjectAllocationView> {
    const existing = await this.findOrgAllocationOrThrow(actor, id);
    assertValidProjectAllocationTransition(existing.status, ProjectAllocationStatus.CANCELLED);

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const result = await tx.projectAllocation.updateMany({
        where: { id, organization_id: actor.organizationId, status: ProjectAllocationStatus.DRAFT, version: dto.version },
        data: { status: ProjectAllocationStatus.CANCELLED, cancelled_at: new Date(), version: { increment: 1 } },
      });
      if (result.count !== 1) {
        throw new ConflictException({
          code: "PROJECT_ALLOCATION_VERSION_CONFLICT",
          message: "This allocation was changed by someone else. Reload and try again.",
        });
      }
      return tx.projectAllocation.findUniqueOrThrow({ where: { id } });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: ActorType.USER,
      actorId: actor.id,
      action: EARNINGS_AUDIT_ACTIONS.PROJECT_ALLOCATION_CANCELLED,
      entityType: "ProjectAllocation",
      entityId: cancelled.id,
      after: toProjectAllocationAuditSnapshot({
        id: cancelled.id,
        projectId: cancelled.project_id,
        status: cancelled.status,
        totalAllocated: cancelled.total_allocated.toFixed(2),
        adjustmentOfId: cancelled.adjustment_of_id,
      }),
    });

    return this.get(actor, cancelled.id);
  }

  /** `POST /project-allocations/:id/adjust` — starts a correction round against an APPROVED allocation. Empty draft; lines are added via replaceLines. */
  async adjust(actor: AuthenticatedUser, id: string): Promise<ProjectAllocationView> {
    const original = await this.findOrgAllocationOrThrow(actor, id);
    if (original.status !== ProjectAllocationStatus.APPROVED) {
      throw new ConflictException({
        code: "PROJECT_ALLOCATION_NOT_APPROVED",
        message: "Only an approved allocation can be corrected.",
      });
    }

    const created = await this.prisma.projectAllocation.create({
      data: {
        organization_id: actor.organizationId,
        project_id: original.project_id,
        status: ProjectAllocationStatus.DRAFT,
        adjustment_of_id: original.id,
        created_by: actor.id,
        total_allocated: new Prisma.Decimal(0),
      },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: ActorType.USER,
      actorId: actor.id,
      action: EARNINGS_AUDIT_ACTIONS.PROJECT_ALLOCATION_CREATED,
      entityType: "ProjectAllocation",
      entityId: created.id,
      after: toProjectAllocationAuditSnapshot({
        id: created.id,
        projectId: created.project_id,
        status: created.status,
        totalAllocated: "0.00",
        adjustmentOfId: created.adjustment_of_id,
      }),
    });

    return this.get(actor, created.id);
  }

  private async liveFinancials(organizationId: string, projectId: string) {
    const [revenue, expenses] = await Promise.all([
      this.financials.computeRevenue(this.prisma, organizationId, projectId),
      this.financials.computeExpenses(this.prisma, organizationId, projectId),
    ]);
    const raw = revenue.minus(expenses);
    const distributable = raw.isNegative() ? new Prisma.Decimal(0) : raw;
    return { revenue, expenses, distributable };
  }

  private async createLines(
    tx: Prisma.TransactionClient,
    organizationId: string,
    allocationId: string,
    lines: ProjectAllocationLineInputDto[]
  ): Promise<void> {
    try {
      await tx.projectAllocationLine.createMany({
        data: lines.map((line) => ({
          organization_id: organizationId,
          project_allocation_id: allocationId,
          user_id: line.userId,
          amount: new Prisma.Decimal(line.amount),
          note: line.note,
        })),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException({
          code: "DUPLICATE_MEMBER_LINE",
          message: "A member can only have one line per allocation round.",
        });
      }
      throw error;
    }
  }

  private assertNoDuplicateLines(lines: ProjectAllocationLineInputDto[]): void {
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.userId)) {
        throw new BadRequestException({
          code: "DUPLICATE_MEMBER_LINE",
          message: "A member can only have one line per allocation round.",
          details: { userId: line.userId },
        });
      }
      seen.add(line.userId);
    }
  }

  /** Normal rounds: amount must be positive. Adjustment rounds: amount may be signed but never zero. */
  private assertLineSign(amount: string, isAdjustment: boolean): void {
    const decimal = new Prisma.Decimal(amount);
    if (decimal.isZero()) {
      throw new BadRequestException({
        code: "ALLOCATION_LINE_AMOUNT_ZERO",
        message: "A line amount cannot be zero.",
      });
    }
    if (!isAdjustment && decimal.isNegative()) {
      throw new BadRequestException({
        code: "ALLOCATION_LINE_MUST_BE_POSITIVE",
        message: "Only an adjustment round may contain a negative (clawback) line.",
      });
    }
  }

  private sumLines(lines: ProjectAllocationLineInputDto[]): Prisma.Decimal {
    return lines.reduce((sum, line) => sum.plus(new Prisma.Decimal(line.amount)), new Prisma.Decimal(0));
  }

  private async findOrgAllocationOrThrow(actor: AuthenticatedUser, id: string): Promise<AllocationDetail> {
    const allocation = await this.prisma.projectAllocation.findFirst({
      where: { id, organization_id: actor.organizationId },
      include: DETAIL_INCLUDE,
    });
    if (!allocation) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Project allocation not found." });
    }
    return allocation;
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ProjectPhase,
  ProjectStatus,
  type Prisma,
  type Project,
} from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import {
  buildOffsetMeta,
  offsetSkipTake,
  type ListEnvelope,
} from "../../../common/pagination/offset-pagination";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type {
  CreateProjectDto,
  HandoverItemDto,
  ListProjectsQueryDto,
  TransitionProjectPhaseDto,
  TransitionProjectStatusDto,
  UpdateHandoverChecklistDto,
  UpdateProjectDto,
} from "../dto/project.dto";
import {
  assertHandoverChecklistAllDone,
  assertPhaseGatesSatisfied,
  assertValidPhaseProgression,
  assertValidStatusTransition,
  TERMINAL_PROJECT_STATUSES,
  type HandoverChecklistItem,
} from "../policies/project-state-machine";
import {
  assertTeamMemberMayAccessProject,
  teamMemberProjectWhere,
} from "../policies/resource-authorization";
import {
  assertCompanyInOrg,
  assertDealInOrg,
  assertUserInOrg,
} from "./scope-guards";

export interface ProjectHealth {
  atRisk: boolean;
  overdueMilestones: number;
  deadlineProximityDays: number | null;
}

export type ProjectWithDetails = Project & {
  company?: { id: string; name: string };
  health?: ProjectHealth;
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: ListProjectsQueryDto
  ): Promise<ListEnvelope<ProjectWithDetails>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.ProjectWhereInput = {
      organization_id: actor.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.phase ? { phase: query.phase } : {}),
      ...(query.ownerId ? { owner_id: query.ownerId } : {}),
      ...(query.companyId ? { company_id: query.companyId } : {}),
      ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {}),
      ...teamMemberProjectWhere(actor),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        orderBy: { created_at: "desc" },
        include: { company: { select: { id: true, name: true } } },
        ...offsetSkipTake(page, pageSize),
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data,
      meta: { pagination: buildOffsetMeta(page, pageSize, total) },
    };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<ProjectWithDetails> {
    const project = await this.prisma.project.findFirst({
      where: { id, organization_id: actor.organizationId },
      include: {
        company: { select: { id: true, name: true } },
        milestones: {
          select: {
            id: true,
            status: true,
            due_date: true,
            requires_client_approval: true,
            approved_at: true,
          },
        },
        tasks: {
          select: {
            id: true,
            assignee_id: true,
            status: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found." });
    }

    assertTeamMemberMayAccessProject(actor, project);

    const now = new Date();
    const overdueMilestones = project.milestones.filter(
      (m) => m.status !== "COMPLETED" && m.due_date && new Date(m.due_date) < now
    ).length;

    let deadlineProximityDays: number | null = null;
    if (project.deadline) {
      const deadlineDate = new Date(project.deadline);
      const diffMs = deadlineDate.getTime() - now.getTime();
      deadlineProximityDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }

    const health: ProjectHealth = {
      atRisk: project.status === ProjectStatus.AT_RISK,
      overdueMilestones,
      deadlineProximityDays,
    };

    return {
      ...project,
      health,
    };
  }

  async create(actor: AuthenticatedUser, dto: CreateProjectDto): Promise<Project> {
    await assertCompanyInOrg(this.prisma, dto.companyId, actor.organizationId);
    if (dto.dealId) {
      await assertDealInOrg(this.prisma, dto.dealId, actor.organizationId);
    }
    const ownerId = dto.ownerId ?? actor.id;
    await assertUserInOrg(this.prisma, ownerId, actor.organizationId);

    const initialChecklist = (dto.handoverChecklist ?? []).map((item) => ({
      item: item.item,
      done: item.done,
      done_at: item.done ? (item.doneAt ?? new Date().toISOString()) : null,
      done_by: item.done ? (item.doneBy ?? actor.id) : null,
    }));

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          organization_id: actor.organizationId,
          name: dto.name,
          company_id: dto.companyId,
          deal_id: dto.dealId,
          owner_id: ownerId,
          deadline: dto.deadline ? new Date(dto.deadline) : null,
          handover_checklist: initialChecklist,
        },
        include: {
          company: { select: { id: true, name: true } },
        },
      });

      return created;
    });
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateProjectDto): Promise<Project> {
    const existing = await this.get(actor, id);
    if (dto.ownerId) {
      await assertUserInOrg(this.prisma, dto.ownerId, actor.organizationId);
    }

    return this.prisma.$transaction(async (tx) => {
      return tx.project.update({
        where: { id: existing.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.deadline !== undefined ? { deadline: dto.deadline ? new Date(dto.deadline) : null } : {}),
          ...(dto.ownerId !== undefined ? { owner_id: dto.ownerId } : {}),
        },
        include: {
          company: { select: { id: true, name: true } },
        },
      });
    });
  }

  async transitionStatus(
    actor: AuthenticatedUser,
    id: string,
    dto: TransitionProjectStatusDto
  ): Promise<Project> {
    const project = await this.get(actor, id);
    assertValidStatusTransition(project.status, dto.to);

    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.project.update({
        where: { id: project.id },
        data: {
          status: dto.to,
        },
        include: {
          company: { select: { id: true, name: true } },
        },
      });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.PROJECT_STATUS_CHANGED,
      entityType: "Project",
      entityId: project.id,
      before: { status: project.status },
      after: { status: dto.to },
    });

    return updated;
  }

  async transitionPhase(
    actor: AuthenticatedUser,
    id: string,
    dto: TransitionProjectPhaseDto
  ): Promise<Project> {
    const project = await this.prisma.project.findFirst({
      where: { id, organization_id: actor.organizationId },
      include: {
        company: { select: { id: true, name: true } },
        milestones: {
          select: {
            id: true,
            requires_client_approval: true,
            approved_at: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found." });
    }

    assertValidPhaseProgression(project.phase, dto.to, dto.override);

    const checklist = Array.isArray(project.handover_checklist)
      ? (project.handover_checklist as unknown as HandoverChecklistItem[])
      : [];

    const gatingMilestones = project.milestones.map((m) => ({
      id: m.id,
      requiresClientApproval: m.requires_client_approval,
      approvedAt: m.approved_at,
    }));

    assertPhaseGatesSatisfied(project.phase, dto.to, {
      milestones: gatingMilestones,
      handoverChecklist: checklist,
      override: dto.override,
    });

    const isCompleting = dto.to === ProjectPhase.COMPLETED;

    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.project.update({
        where: { id: project.id },
        data: {
          phase: dto.to,
          ...(isCompleting
            ? {
                status: ProjectStatus.COMPLETED,
                completed_at: new Date(),
              }
            : {}),
        },
        include: {
          company: { select: { id: true, name: true } },
        },
      });
    });

    const auditAction = dto.override
      ? AUDIT_ACTIONS.PROJECT_PHASE_OVERRIDDEN
      : AUDIT_ACTIONS.PROJECT_PHASE_CHANGED;

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: auditAction,
      entityType: "Project",
      entityId: project.id,
      before: { phase: project.phase },
      after: {
        phase: dto.to,
        ...(dto.override ? { overrideReason: dto.overrideReason ?? null } : {}),
      },
    });

    return updated;
  }

  async updateHandoverChecklist(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateHandoverChecklistDto
  ): Promise<Project> {
    const project = await this.get(actor, id);

    const prevChecklist = Array.isArray(project.handover_checklist)
      ? (project.handover_checklist as unknown as HandoverItemDto[])
      : [];

    let completedAnyItem = false;

    const formattedItems = dto.items.map((newItem) => {
      const prev = prevChecklist.find((p) => p.item === newItem.item);
      const wasDone = prev?.done ?? false;
      const isNowDone = newItem.done;

      if (!wasDone && isNowDone) {
        completedAnyItem = true;
      }

      return {
        item: newItem.item,
        done: newItem.done,
        done_at: newItem.done
          ? (newItem.doneAt ?? prev?.doneAt ?? new Date().toISOString())
          : null,
        done_by: newItem.done
          ? (newItem.doneBy ?? prev?.doneBy ?? actor.id)
          : null,
      };
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.project.update({
        where: { id: project.id },
        data: {
          handover_checklist: formattedItems,
        },
        include: {
          company: { select: { id: true, name: true } },
        },
      });
    });

    if (completedAnyItem) {
      await this.audit.record({
        organizationId: actor.organizationId,
        actorType: "USER",
        actorId: actor.id,
        action: AUDIT_ACTIONS.PROJECT_HANDOVER_ITEM_COMPLETED,
        entityType: "Project",
        entityId: project.id,
        after: { handoverChecklist: formattedItems },
      });
    }

    return updated;
  }

  async complete(actor: AuthenticatedUser, id: string): Promise<Project> {
    const project = await this.get(actor, id);

    if (TERMINAL_PROJECT_STATUSES.has(project.status)) {
      throw new ConflictException({
        code: "PROJECT_ALREADY_TERMINAL",
        message: `Project is already ${project.status.toLowerCase()}.`,
      });
    }

    const checklist = Array.isArray(project.handover_checklist)
      ? (project.handover_checklist as unknown as HandoverChecklistItem[])
      : [];

    assertHandoverChecklistAllDone(checklist);

    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.project.update({
        where: { id: project.id },
        data: {
          status: ProjectStatus.COMPLETED,
          phase: ProjectPhase.COMPLETED,
          completed_at: new Date(),
        },
        include: {
          company: { select: { id: true, name: true } },
        },
      });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.PROJECT_COMPLETED,
      entityType: "Project",
      entityId: project.id,
      before: { status: project.status, phase: project.phase },
      after: { status: ProjectStatus.COMPLETED, phase: ProjectPhase.COMPLETED },
    });

    return updated;
  }
}

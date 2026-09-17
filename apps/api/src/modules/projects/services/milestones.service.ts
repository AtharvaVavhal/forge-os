import { Injectable, NotFoundException } from "@nestjs/common";
import { MilestoneStatus, type Milestone } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type { CreateMilestoneDto, TransitionMilestoneDto } from "../dto/milestone.dto";
import { assertValidMilestoneTransition } from "../policies/milestone-state-machine";
import { assertTeamMemberMayAccessProject } from "../policies/resource-authorization";

@Injectable()
export class MilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(actor: AuthenticatedUser, projectId: string): Promise<ListEnvelope<Milestone>> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organization_id: actor.organizationId },
      include: { tasks: { select: { assignee_id: true } } },
    });

    if (!project) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found." });
    }

    assertTeamMemberMayAccessProject(actor, project);

    const milestones = await this.prisma.milestone.findMany({
      where: { project_id: projectId, organization_id: actor.organizationId },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    });

    return {
      data: milestones,
      meta: {
        pagination: buildOffsetMeta(1, milestones.length || 25, milestones.length),
      },
    };
  }

  async create(
    actor: AuthenticatedUser,
    projectId: string,
    dto: CreateMilestoneDto
  ): Promise<Milestone> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organization_id: actor.organizationId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found." });
    }

    return this.prisma.$transaction(async (tx) => {
      return tx.milestone.create({
        data: {
          organization_id: actor.organizationId,
          project_id: projectId,
          name: dto.name,
          requires_client_approval: dto.requiresClientApproval ?? false,
          due_date: dto.dueDate ? new Date(dto.dueDate) : null,
          sort_order: dto.sortOrder ?? 0,
        },
      });
    });
  }

  async transition(
    actor: AuthenticatedUser,
    id: string,
    dto: TransitionMilestoneDto
  ): Promise<Milestone> {
    const milestone = await this.prisma.milestone.findFirst({
      where: { id, organization_id: actor.organizationId },
    });

    if (!milestone) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Milestone not found." });
    }

    assertValidMilestoneTransition(milestone.status, dto.to, dto.reason);

    const isReverting = milestone.status === MilestoneStatus.COMPLETED;

    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.milestone.update({
        where: { id: milestone.id },
        data: {
          status: dto.to,
        },
      });
    });

    const auditAction = isReverting
      ? AUDIT_ACTIONS.MILESTONE_REVERTED
      : AUDIT_ACTIONS.MILESTONE_TRANSITIONED;

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: auditAction,
      entityType: "Milestone",
      entityId: milestone.id,
      before: { status: milestone.status },
      after: {
        status: dto.to,
        ...(dto.reason ? { reason: dto.reason } : {}),
      },
    });

    return updated;
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import {
  buildOffsetMeta,
  offsetSkipTake,
  type ListEnvelope,
} from "../../../common/pagination/offset-pagination";
import type { AuthenticatedPortalUser } from "../types/authenticated-portal-request.interface";
import type { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";

type HandoverChecklistItem = {
  item: string;
  done: boolean;
  doneAt?: string | null;
};

@Injectable()
export class PortalProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    client: AuthenticatedPortalUser,
    query: OffsetPaginationQueryDto
  ): Promise<ListEnvelope<Record<string, unknown>>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const { skip, take } = offsetSkipTake(page, pageSize);

    const where = {
      organization_id: client.organizationId,
      company_id: client.companyId,
    };

    const [rows, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          phase: true,
          deadline: true,
          completed_at: true,
          created_at: true,
          updated_at: true,
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    return { data: rows, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  async get(client: AuthenticatedPortalUser, id: string): Promise<Record<string, unknown>> {
    const project = await this.findScopedProject(client, id);
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      phase: project.phase,
      deadline: project.deadline,
      completedAt: project.completed_at,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    };
  }

  async listMilestones(
    client: AuthenticatedPortalUser,
    projectId: string
  ): Promise<ListEnvelope<Record<string, unknown>>> {
    await this.findScopedProject(client, projectId);

    const milestones = await this.prisma.milestone.findMany({
      where: {
        organization_id: client.organizationId,
        project_id: projectId,
      },
      orderBy: { sort_order: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        due_date: true,
        requires_client_approval: true,
        approved_at: true,
        sort_order: true,
      },
    });

    return {
      data: milestones,
      meta: { pagination: buildOffsetMeta(1, milestones.length || 25, milestones.length) },
    };
  }

  async getHandover(
    client: AuthenticatedPortalUser,
    projectId: string
  ): Promise<{ items: Array<{ item: string; done: boolean; doneAt: string | null }> }> {
    const project = await this.findScopedProject(client, projectId);
    const checklist = Array.isArray(project.handover_checklist)
      ? (project.handover_checklist as unknown as HandoverChecklistItem[])
      : [];

    return {
      items: checklist.map((entry) => ({
        item: entry.item,
        done: Boolean(entry.done),
        doneAt: entry.doneAt ?? null,
      })),
    };
  }

  private async findScopedProject(client: AuthenticatedPortalUser, id: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id,
        organization_id: client.organizationId,
        company_id: client.companyId,
      },
    });
    if (!project) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found." });
    }
    return project;
  }
}

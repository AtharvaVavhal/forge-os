import { Injectable, NotFoundException } from "@nestjs/common";
import { UserRole, type TimeEntry } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type { CreateTimeEntryDto } from "../dto/time-entry.dto";
import {
  assertCanDeleteTimeEntry,
  assertTeamMemberMayAccessProject,
} from "../policies/resource-authorization";

@Injectable()
export class TimeEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, taskId: string): Promise<ListEnvelope<TimeEntry>> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organization_id: actor.organizationId },
      include: {
        project: {
          include: { tasks: { select: { assignee_id: true } } },
        },
      },
    });

    if (!task) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Task not found." });
    }

    assertTeamMemberMayAccessProject(actor, task.project);

    const where = {
      task_id: taskId,
      organization_id: actor.organizationId,
      ...(actor.role === UserRole.TEAM_MEMBER ? { user_id: actor.id } : {}),
    };

    const entries = await this.prisma.timeEntry.findMany({
      where,
      orderBy: { created_at: "desc" },
    });

    return {
      data: entries,
      meta: {
        pagination: buildOffsetMeta(1, entries.length || 25, entries.length),
      },
    };
  }

  async create(
    actor: AuthenticatedUser,
    taskId: string,
    dto: CreateTimeEntryDto
  ): Promise<TimeEntry> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organization_id: actor.organizationId },
      include: {
        project: {
          include: { tasks: { select: { assignee_id: true } } },
        },
      },
    });

    if (!task) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Task not found." });
    }

    assertTeamMemberMayAccessProject(actor, task.project);

    return this.prisma.$transaction(async (tx) => {
      return tx.timeEntry.create({
        data: {
          organization_id: actor.organizationId,
          task_id: taskId,
          user_id: actor.id,
          minutes: dto.minutes,
          logged_at: new Date(dto.loggedAt),
        },
      });
    });
  }

  async delete(actor: AuthenticatedUser, id: string): Promise<void> {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id, organization_id: actor.organizationId },
    });

    if (!entry) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Time entry not found." });
    }

    assertCanDeleteTimeEntry(actor, entry);

    await this.prisma.$transaction(async (tx) => {
      await tx.timeEntry.delete({
        where: { id: entry.id },
      });
    });
  }
}

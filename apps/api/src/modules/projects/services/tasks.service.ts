import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, Task } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import {
  buildOffsetMeta,
  offsetSkipTake,
  type ListEnvelope,
} from "../../../common/pagination/offset-pagination";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type {
  AssignTaskDto,
  CreateTaskDto,
  ListTasksQueryDto,
  TransitionTaskDto,
  UpdateTaskDto,
} from "../dto/task.dto";
import {
  assertTeamMemberMayAccessProject,
  assertCanMutateTask,
} from "../policies/resource-authorization";
import {
  assertValidTaskTransition,
  isTaskReopen,
} from "../policies/task-state-machine";
import {
  assertMilestoneInProject,
  assertTaskInProject,
  assertUserInOrg,
} from "./scope-guards";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(
    actor: AuthenticatedUser,
    projectId: string,
    query: ListTasksQueryDto
  ): Promise<ListEnvelope<Task>> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organization_id: actor.organizationId },
      include: { tasks: { select: { assignee_id: true } } },
    });

    if (!project) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found." });
    }

    assertTeamMemberMayAccessProject(actor, project);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.TaskWhereInput = {
      organization_id: actor.organizationId,
      project_id: projectId,
      ...(query.milestoneId ? { milestone_id: query.milestoneId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assigneeId ? { assignee_id: query.assigneeId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        orderBy: { created_at: "desc" },
        ...offsetSkipTake(page, pageSize),
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data,
      meta: { pagination: buildOffsetMeta(page, pageSize, total) },
    };
  }

  async create(actor: AuthenticatedUser, projectId: string, dto: CreateTaskDto): Promise<Task> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organization_id: actor.organizationId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found." });
    }

    if (dto.milestoneId) {
      await assertMilestoneInProject(this.prisma, dto.milestoneId, projectId, actor.organizationId);
    }
    if (dto.assigneeId) {
      await assertUserInOrg(this.prisma, dto.assigneeId, actor.organizationId);
    }
    if (dto.blockedByTaskId) {
      await assertTaskInProject(this.prisma, dto.blockedByTaskId, projectId, actor.organizationId);
    }

    return this.prisma.$transaction(async (tx) => {
      return tx.task.create({
        data: {
          organization_id: actor.organizationId,
          project_id: projectId,
          title: dto.title,
          priority: dto.priority ?? "MEDIUM",
          milestone_id: dto.milestoneId,
          assignee_id: dto.assigneeId,
          due_date: dto.dueDate ? new Date(dto.dueDate) : null,
          blocked_by_task_id: dto.blockedByTaskId,
        },
      });
    });
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id, organization_id: actor.organizationId },
    });

    if (!task) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Task not found." });
    }

    assertCanMutateTask(actor, task);

    if (dto.milestoneId) {
      await assertMilestoneInProject(this.prisma, dto.milestoneId, task.project_id, actor.organizationId);
    }
    if (dto.blockedByTaskId) {
      if (dto.blockedByTaskId === task.id) {
        throw new BadRequestException({
          code: "TASK_CANNOT_BLOCK_SELF",
          message: "A task cannot be blocked by itself.",
        });
      }
      await assertTaskInProject(this.prisma, dto.blockedByTaskId, task.project_id, actor.organizationId);
    }

    return this.prisma.$transaction(async (tx) => {
      return tx.task.update({
        where: { id: task.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.dueDate !== undefined ? { due_date: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
          ...(dto.milestoneId !== undefined ? { milestone_id: dto.milestoneId } : {}),
          ...(dto.blockedByTaskId !== undefined ? { blocked_by_task_id: dto.blockedByTaskId } : {}),
        },
      });
    });
  }

  async transition(actor: AuthenticatedUser, id: string, dto: TransitionTaskDto): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id, organization_id: actor.organizationId },
    });

    if (!task) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Task not found." });
    }

    assertCanMutateTask(actor, task);
    assertValidTaskTransition(task.status, dto.to);

    const reopening = isTaskReopen(task.status, dto.to);

    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.task.update({
        where: { id: task.id },
        data: {
          status: dto.to,
        },
      });
    });

    if (reopening) {
      await this.audit.record({
        organizationId: actor.organizationId,
        actorType: "USER",
        actorId: actor.id,
        action: AUDIT_ACTIONS.TASK_REOPENED,
        entityType: "Task",
        entityId: task.id,
        before: { status: task.status },
        after: { status: dto.to },
      });
    }

    return updated;
  }

  async assign(actor: AuthenticatedUser, id: string, dto: AssignTaskDto): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id, organization_id: actor.organizationId },
    });

    if (!task) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Task not found." });
    }

    await assertUserInOrg(this.prisma, dto.assigneeId, actor.organizationId);

    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.task.update({
        where: { id: task.id },
        data: {
          assignee_id: dto.assigneeId,
        },
      });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.TASK_ASSIGNED,
      entityType: "Task",
      entityId: task.id,
      before: { assigneeId: task.assignee_id },
      after: { assigneeId: dto.assigneeId },
    });

    return updated;
  }
}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TaskStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import {
  buildOffsetMeta,
  offsetSkipTake,
  type ListEnvelope,
} from "../../../common/pagination/offset-pagination";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type {
  ListTeamMembersQueryDto,
  TeamWorkloadQueryDto,
} from "../dto/team.dto";

export interface TeamMemberRecord {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkloadRow {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  openTaskCount: number;
  timeEntryCount: number;
}

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  async listMembers(
    actor: AuthenticatedUser,
    query: ListTeamMembersQueryDto
  ): Promise<ListEnvelope<TeamMemberRecord>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.UserWhereInput = {
      organization_id: actor.organizationId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.active !== undefined ? { active: query.active } : {}),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          organization_id: true,
          email: true,
          name: true,
          role: true,
          active: true,
          last_login_at: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: [{ active: "desc" }, { name: "asc" }],
        ...offsetSkipTake(page, pageSize),
      }),
      this.prisma.user.count({ where }),
    ]);

    const data: TeamMemberRecord[] = users.map((u) => ({
      id: u.id,
      organizationId: u.organization_id,
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
      lastLoginAt: u.last_login_at,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
    }));

    return {
      data,
      meta: { pagination: buildOffsetMeta(page, pageSize, total) },
    };
  }

  async getWorkload(
    actor: AuthenticatedUser,
    query: TeamWorkloadQueryDto
  ): Promise<{ rows: WorkloadRow[] }> {
    // Document 5 §4.2 / Document 6 §2.3 footnote 4:
    // TEAM_MEMBER can only query their own workload.
    let targetUserId = query.userId;
    if (actor.role === UserRole.TEAM_MEMBER) {
      if (targetUserId && targetUserId !== actor.id) {
        throw new ForbiddenException({
          code: "FORBIDDEN_PERMISSION",
          message: "You can only view your own workload.",
        });
      }
      targetUserId = actor.id;
    }

    if (targetUserId) {
      const user = await this.prisma.user.findFirst({
        where: { id: targetUserId, organization_id: actor.organizationId },
        select: { id: true, name: true, email: true, role: true },
      });
      if (!user) {
        throw new NotFoundException({
          code: "NOT_FOUND",
          message: "Team member not found.",
        });
      }

      const [openTaskCount, timeEntryCount] = await Promise.all([
        this.prisma.task.count({
          where: {
            organization_id: actor.organizationId,
            assignee_id: user.id,
            status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW] },
          },
        }),
        this.prisma.timeEntry.count({
          where: {
            organization_id: actor.organizationId,
            user_id: user.id,
          },
        }),
      ]);

      return {
        rows: [
          {
            userId: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            openTaskCount,
            timeEntryCount,
          },
        ],
      };
    }

    // List workload for all active team members in the organization
    const users = await this.prisma.user.findMany({
      where: {
        organization_id: actor.organizationId,
        active: true,
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });

    const rows: WorkloadRow[] = await Promise.all(
      users.map(async (u) => {
        const [openTaskCount, timeEntryCount] = await Promise.all([
          this.prisma.task.count({
            where: {
              organization_id: actor.organizationId,
              assignee_id: u.id,
              status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW] },
            },
          }),
          this.prisma.timeEntry.count({
            where: {
              organization_id: actor.organizationId,
              user_id: u.id,
            },
          }),
        ]);

        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          openTaskCount,
          timeEntryCount,
        };
      })
    );

    return { rows };
  }
}

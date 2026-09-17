import { Injectable, NotFoundException } from "@nestjs/common";
import { TicketStatus } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import {
  buildOffsetMeta,
  offsetSkipTake,
  type ListEnvelope,
  type OffsetPaginationQueryDto,
} from "../../../common/pagination/offset-pagination";
import type { AuthenticatedPortalUser } from "../types/authenticated-portal-request.interface";

@Injectable()
export class PortalSupportService {
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
      project: { company_id: client.companyId },
    };

    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          subject: true,
          status: true,
          project_id: true,
          raised_by_client_user_id: true,
          resolved_at: true,
          created_at: true,
          updated_at: true,
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return { data: rows, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  async create(
    client: AuthenticatedPortalUser,
    input: { projectId: string; subject: string }
  ): Promise<Record<string, unknown>> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: input.projectId,
        organization_id: client.organizationId,
        company_id: client.companyId,
      },
    });
    if (!project) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Project not found." });
    }

    return this.prisma.supportTicket.create({
      data: {
        organization_id: client.organizationId,
        project_id: project.id,
        raised_by_client_user_id: client.id,
        subject: input.subject.trim(),
        status: TicketStatus.OPEN,
      },
      select: {
        id: true,
        subject: true,
        status: true,
        project_id: true,
        raised_by_client_user_id: true,
        created_at: true,
        updated_at: true,
      },
    });
  }
}

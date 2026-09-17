import { Injectable } from "@nestjs/common";
import { AuditLog, Prisma } from "@prisma/client";
import { PrismaService } from "../../../../database/prisma.service";
import {
  buildCursorMeta,
  cursorWhere,
  paginateCursorResult,
} from "../../../../common/pagination/cursor-pagination";
import type { ListEnvelope } from "../../../../common/pagination/offset-pagination";
import type { AuthenticatedUser } from "../../../auth/types/authenticated-request.interface";
import type { ListAuditLogsQueryDto } from "../dto/audit-log.dto";

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    actor: AuthenticatedUser,
    query: ListAuditLogsQueryDto
  ): Promise<ListEnvelope<AuditLog>> {
    const limit = query.limit ?? 25;

    const createdAtFilter: Prisma.DateTimeFilter = {};
    if (query.from) {
      createdAtFilter.gte = new Date(query.from);
    }
    if (query.to) {
      createdAtFilter.lte = new Date(query.to);
    }

    const where: Prisma.AuditLogWhereInput = {
      organization_id: actor.organizationId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entity_type: query.entityType } : {}),
      ...(query.entityId ? { entity_id: query.entityId } : {}),
      ...(query.actorId ? { actor_id: query.actorId } : {}),
      ...(query.from || query.to ? { created_at: createdAtFilter } : {}),
      ...cursorWhere(query.cursor),
    };

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const { data, nextCursor } = paginateCursorResult(rows, limit);
    return { data, meta: { pagination: buildCursorMeta(limit, nextCursor) } };
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ActorType,
  Note,
  Prisma,
  UserRole,
  Visibility,
} from "@prisma/client";
import { PrismaService } from "../../../../database/prisma.service";
import {
  buildCursorMeta,
  cursorWhere,
  paginateCursorResult,
} from "../../../../common/pagination/cursor-pagination";
import type { ListEnvelope } from "../../../../common/pagination/offset-pagination";
import type { AuthenticatedUser } from "../../../auth/types/authenticated-request.interface";
import { AuditService, AUDIT_ACTIONS } from "../../audit.service";
import type {
  CreateNoteDto,
  ListNotesQueryDto,
  UpdateNoteDto,
} from "../dto/note.dto";

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async create(actor: AuthenticatedUser, dto: CreateNoteDto): Promise<Note> {
    const parentCount = [
      dto.companyId,
      dto.contactId,
      dto.dealId,
      dto.projectId,
    ].filter((v) => v !== undefined).length;

    if (parentCount !== 1) {
      throw new BadRequestException({
        code: "NOTE_REQUIRES_EXACTLY_ONE_PARENT",
        message:
          "A note must have exactly one of companyId, contactId, dealId, or projectId.",
      });
    }

    if (dto.companyId) {
      const company = await this.prisma.company.findFirst({
        where: { id: dto.companyId, organization_id: actor.organizationId },
        select: { id: true },
      });
      if (!company) {
        throw new NotFoundException({
          code: "PARENT_NOT_FOUND",
          message: "Company not found in organization.",
        });
      }
    } else if (dto.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: dto.contactId, organization_id: actor.organizationId },
        select: { id: true },
      });
      if (!contact) {
        throw new NotFoundException({
          code: "PARENT_NOT_FOUND",
          message: "Contact not found in organization.",
        });
      }
    } else if (dto.dealId) {
      const deal = await this.prisma.deal.findFirst({
        where: { id: dto.dealId, organization_id: actor.organizationId },
        select: { id: true },
      });
      if (!deal) {
        throw new NotFoundException({
          code: "PARENT_NOT_FOUND",
          message: "Deal not found in organization.",
        });
      }
    } else if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, organization_id: actor.organizationId },
        select: { id: true },
      });
      if (!project) {
        throw new NotFoundException({
          code: "PARENT_NOT_FOUND",
          message: "Project not found in organization.",
        });
      }
    }

    return this.prisma.note.create({
      data: {
        organization_id: actor.organizationId,
        body: dto.body,
        visibility: dto.visibility ?? Visibility.INTERNAL,
        company_id: dto.companyId,
        contact_id: dto.contactId,
        deal_id: dto.dealId,
        project_id: dto.projectId,
        created_by: actor.id,
      },
    });
  }

  async list(
    actor: AuthenticatedUser,
    query: ListNotesQueryDto
  ): Promise<ListEnvelope<Note>> {
    const limit = query.limit ?? 25;

    const where: Prisma.NoteWhereInput = {
      organization_id: actor.organizationId,
      ...(query.companyId ? { company_id: query.companyId } : {}),
      ...(query.contactId ? { contact_id: query.contactId } : {}),
      ...(query.dealId ? { deal_id: query.dealId } : {}),
      ...(query.projectId ? { project_id: query.projectId } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...cursorWhere(query.cursor),
    };

    const rows = await this.prisma.note.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const { data, nextCursor } = paginateCursorResult(rows, limit);
    return { data, meta: { pagination: buildCursorMeta(limit, nextCursor) } };
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateNoteDto
  ): Promise<Note> {
    const note = await this.prisma.note.findFirst({
      where: { id, organization_id: actor.organizationId },
    });
    if (!note) {
      throw new NotFoundException({
        code: "NOTE_NOT_FOUND",
        message: "Note not found.",
      });
    }

    if (actor.role === UserRole.TEAM_MEMBER && note.created_by !== actor.id) {
      throw new ForbiddenException({
        code: "FORBIDDEN_PERMISSION",
        message: "Team members can only update their own notes.",
      });
    }

    const visibilityChanged =
      dto.visibility !== undefined && dto.visibility !== note.visibility;

    const updated = await this.prisma.note.update({
      where: { id: note.id },
      data: {
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
      },
    });

    if (visibilityChanged) {
      await this.audit.record({
        organizationId: actor.organizationId,
        actorType: ActorType.USER,
        actorId: actor.id,
        action: AUDIT_ACTIONS.NOTE_VISIBILITY_CHANGED,
        entityType: "NOTE",
        entityId: note.id,
        before: { visibility: note.visibility },
        after: { visibility: dto.visibility },
      });
    }

    return updated;
  }
}

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
import {
  assertCrmRoleMayAccessLeadsOrDeals,
  assertTeamMemberMayViewCompanyOrContact,
} from "../../../crm/policies/resource-authorization";
import {
  assertTeamMemberMayAccessProject,
  teamMemberProjectWhere,
} from "../../../projects/policies/resource-authorization";
import { AuditService, AUDIT_ACTIONS } from "../../audit.service";
import type {
  CreateNoteDto,
  ListNotesQueryDto,
  UpdateNoteDto,
} from "../dto/note.dto";

type NoteParentIds = {
  companyId?: string;
  contactId?: string;
  dealId?: string;
  projectId?: string;
};

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

    await this.assertParentInOrgAndAuthorized(actor, dto);

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

    // When a specific parent is requested, enforce the same authz as create
    // so TEAM_MEMBER cannot probe CRM parents via list filters.
    if (query.companyId || query.contactId || query.dealId || query.projectId) {
      const parentCount = [
        query.companyId,
        query.contactId,
        query.dealId,
        query.projectId,
      ].filter((v) => v !== undefined).length;
      if (parentCount === 1) {
        await this.assertParentInOrgAndAuthorized(actor, {
          companyId: query.companyId,
          contactId: query.contactId,
          dealId: query.dealId,
          projectId: query.projectId,
        });
      }
    }

    const where: Prisma.NoteWhereInput = {
      organization_id: actor.organizationId,
      ...(query.companyId ? { company_id: query.companyId } : {}),
      ...(query.contactId ? { contact_id: query.contactId } : {}),
      ...(query.dealId ? { deal_id: query.dealId } : {}),
      ...(query.projectId ? { project_id: query.projectId } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...this.teamMemberNoteListScope(actor),
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

    await this.assertParentInOrgAndAuthorized(actor, {
      companyId: note.company_id ?? undefined,
      contactId: note.contact_id ?? undefined,
      dealId: note.deal_id ?? undefined,
      projectId: note.project_id ?? undefined,
    });

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

  /**
   * B9 H3: mirror DocumentsService parent auth — TEAM_MEMBER CRM fail-closed,
   * deal notes denied, project notes require assignment.
   */
  private async assertParentInOrgAndAuthorized(
    actor: AuthenticatedUser,
    parent: NoteParentIds
  ): Promise<void> {
    if (parent.companyId) {
      const company = await this.prisma.company.findFirst({
        where: { id: parent.companyId, organization_id: actor.organizationId },
        select: { id: true },
      });
      if (!company) {
        throw new NotFoundException({
          code: "PARENT_NOT_FOUND",
          message: "Company not found in organization.",
        });
      }
      assertTeamMemberMayViewCompanyOrContact(actor);
      return;
    }

    if (parent.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: parent.contactId, organization_id: actor.organizationId },
        select: { id: true },
      });
      if (!contact) {
        throw new NotFoundException({
          code: "PARENT_NOT_FOUND",
          message: "Contact not found in organization.",
        });
      }
      assertTeamMemberMayViewCompanyOrContact(actor);
      return;
    }

    if (parent.dealId) {
      const deal = await this.prisma.deal.findFirst({
        where: { id: parent.dealId, organization_id: actor.organizationId },
        select: { id: true },
      });
      if (!deal) {
        throw new NotFoundException({
          code: "PARENT_NOT_FOUND",
          message: "Deal not found in organization.",
        });
      }
      assertCrmRoleMayAccessLeadsOrDeals(actor);
      return;
    }

    if (parent.projectId) {
      const project = await this.prisma.project.findFirst({
        where: {
          id: parent.projectId,
          organization_id: actor.organizationId,
        },
        include: { tasks: { select: { assignee_id: true } } },
      });
      if (!project) {
        throw new NotFoundException({
          code: "PARENT_NOT_FOUND",
          message: "Project not found in organization.",
        });
      }
      assertTeamMemberMayAccessProject(actor, project);
    }
  }

  private teamMemberNoteListScope(actor: AuthenticatedUser): Prisma.NoteWhereInput {
    if (actor.role !== UserRole.TEAM_MEMBER) {
      return {};
    }
    return {
      project_id: { not: null },
      company_id: null,
      contact_id: null,
      deal_id: null,
      project: {
        organization_id: actor.organizationId,
        ...teamMemberProjectWhere(actor),
      },
    };
  }
}

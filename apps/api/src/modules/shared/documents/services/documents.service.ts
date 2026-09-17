import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ActorType,
  Document,
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
import { roleHasPermission } from "../../../auth/policies/permissions";
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
import {
  PresignedDownloadResult,
  PresignedUploadResult,
  StorageService,
} from "./storage.service";
import type {
  CreateDocumentDto,
  ListDocumentsQueryDto,
  PresignUploadDto,
} from "../dto/document.dto";

type DocumentParentIds = {
  companyId?: string;
  contactId?: string;
  dealId?: string;
  projectId?: string;
  invoiceId?: string;
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService
  ) {}

  async presignUpload(
    actor: AuthenticatedUser,
    dto: PresignUploadDto
  ): Promise<PresignedUploadResult> {
    // Document 5 §4.3: TEAM_MEMBER documents.manage is "upload on assigned" —
    // parent must be known and authorized before a storage key is issued.
    if (actor.role === UserRole.TEAM_MEMBER) {
      this.assertExactlyOneParent(dto);
      await this.assertParentInOrgAndAuthorized(actor, dto);
    }

    return this.storage.generateUploadUrl(
      actor.organizationId,
      dto.filename,
      dto.mimeType,
      dto.sizeBytes
    );
  }

  async create(
    actor: AuthenticatedUser,
    dto: CreateDocumentDto
  ): Promise<Document> {
    this.assertExactlyOneParent(dto);
    await this.assertParentInOrgAndAuthorized(actor, dto);

    this.storage.assertValidFile(dto.mimeType, dto.sizeBytes);
    // B9 C2: bind key to caller org and reject reuse (visibility rebinding / exfil).
    this.storage.assertValidStorageKeyForOrg(dto.storageKey, actor.organizationId);
    const existingKey = await this.prisma.document.findFirst({
      where: { storage_key: dto.storageKey },
      select: { id: true },
    });
    if (existingKey) {
      throw new ConflictException({
        code: "STORAGE_KEY_ALREADY_REGISTERED",
        message: "This storageKey is already registered to a document.",
      });
    }

    return this.prisma.document.create({
      data: {
        organization_id: actor.organizationId,
        filename: dto.filename,
        storage_key: dto.storageKey,
        mime_type: dto.mimeType,
        size_bytes: dto.sizeBytes,
        category: dto.category,
        visibility: dto.visibility ?? Visibility.INTERNAL,
        company_id: dto.companyId,
        contact_id: dto.contactId,
        deal_id: dto.dealId,
        project_id: dto.projectId,
        invoice_id: dto.invoiceId,
        uploaded_by: actor.id,
      },
    });
  }

  async list(
    actor: AuthenticatedUser,
    query: ListDocumentsQueryDto
  ): Promise<ListEnvelope<Document>> {
    const limit = query.limit ?? 25;

    // B9 H4: listing invoice-parented documents requires finance.read.
    if (query.invoiceId && !roleHasPermission(actor.role, "finance.read")) {
      throw new ForbiddenException({
        code: "FORBIDDEN_PERMISSION",
        message: "You don't have permission to attach or access invoice documents.",
      });
    }

    const where: Prisma.DocumentWhereInput = {
      organization_id: actor.organizationId,
      deleted_at: null,
      ...(query.companyId ? { company_id: query.companyId } : {}),
      ...(query.contactId ? { contact_id: query.contactId } : {}),
      ...(query.dealId ? { deal_id: query.dealId } : {}),
      ...(query.projectId ? { project_id: query.projectId } : {}),
      ...(query.invoiceId ? { invoice_id: query.invoiceId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...cursorWhere(query.cursor),
      ...this.teamMemberDocumentListScope(actor),
    };

    const rows = await this.prisma.document.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const { data, nextCursor } = paginateCursorResult(rows, limit);
    return { data, meta: { pagination: buildCursorMeta(limit, nextCursor) } };
  }

  async getDownloadUrl(
    actor: AuthenticatedUser,
    id: string
  ): Promise<PresignedDownloadResult> {
    const doc = await this.findAccessibleDocument(actor, id);

    return this.storage.generateDownloadUrl(
      doc.storage_key,
      doc.filename,
      doc.mime_type
    );
  }

  async delete(actor: AuthenticatedUser, id: string): Promise<Document> {
    const doc = await this.findAccessibleDocument(actor, id);

    const now = new Date();
    const updated = await this.prisma.document.update({
      where: { id: doc.id },
      data: { deleted_at: now },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: ActorType.USER,
      actorId: actor.id,
      action: AUDIT_ACTIONS.DOCUMENT_DELETED,
      entityType: "DOCUMENT",
      entityId: doc.id,
      before: { deleted_at: null, filename: doc.filename },
      after: { deleted_at: now, filename: doc.filename },
    });

    return updated;
  }

  private assertExactlyOneParent(parent: DocumentParentIds): void {
    const parentCount = [
      parent.companyId,
      parent.contactId,
      parent.dealId,
      parent.projectId,
      parent.invoiceId,
    ].filter((v) => v !== undefined).length;

    if (parentCount !== 1) {
      throw new BadRequestException({
        code: "DOCUMENT_REQUIRES_EXACTLY_ONE_PARENT",
        message:
          "A document must have exactly one parent: companyId, contactId, dealId, projectId, or invoiceId.",
      });
    }
  }

  /**
   * Organization existence check for every role, plus TEAM_MEMBER
   * "upload on assigned" / CRM fail-closed rules (Document 5 §4.3).
   */
  private async assertParentInOrgAndAuthorized(
    actor: AuthenticatedUser,
    parent: DocumentParentIds
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
      return;
    }

    if (parent.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({
        where: {
          id: parent.invoiceId,
          organization_id: actor.organizationId,
        },
        select: { id: true },
      });
      if (!invoice) {
        throw new NotFoundException({
          code: "PARENT_NOT_FOUND",
          message: "Invoice not found in organization.",
        });
      }
      // B9 H4: invoice-parented documents require finance.read (closes SALES/OPS adjacency).
      if (!roleHasPermission(actor.role, "finance.read")) {
        throw new ForbiddenException({
          code: "FORBIDDEN_PERMISSION",
          message: "You don't have permission to attach or access invoice documents.",
        });
      }
    }
  }

  /**
   * TEAM_MEMBER may only list documents whose parent is an assigned project
   * (Document 5 §4.3 "upload on assigned" / B4 project scope). CRM/finance
   * parents remain fail-closed for this role, matching resource APIs.
   */
  private teamMemberDocumentListScope(
    actor: AuthenticatedUser
  ): Prisma.DocumentWhereInput {
    if (actor.role !== UserRole.TEAM_MEMBER) {
      return {};
    }
    return {
      project_id: { not: null },
      company_id: null,
      contact_id: null,
      deal_id: null,
      invoice_id: null,
      project: {
        organization_id: actor.organizationId,
        ...teamMemberProjectWhere(actor),
      },
    };
  }

  private async findAccessibleDocument(
    actor: AuthenticatedUser,
    id: string
  ): Promise<Document> {
    const doc = await this.prisma.document.findFirst({
      where: {
        id,
        organization_id: actor.organizationId,
        deleted_at: null,
      },
    });
    if (!doc) {
      throw new NotFoundException({
        code: "DOCUMENT_NOT_FOUND",
        message: "Document not found.",
      });
    }

    await this.assertParentInOrgAndAuthorized(actor, {
      companyId: doc.company_id ?? undefined,
      contactId: doc.contact_id ?? undefined,
      dealId: doc.deal_id ?? undefined,
      projectId: doc.project_id ?? undefined,
      invoiceId: doc.invoice_id ?? undefined,
    });

    return doc;
  }
}

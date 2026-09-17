import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ActorType, Document, Prisma, Visibility } from "@prisma/client";
import { PrismaService } from "../../../../database/prisma.service";
import {
  buildCursorMeta,
  cursorWhere,
  paginateCursorResult,
} from "../../../../common/pagination/cursor-pagination";
import type { ListEnvelope } from "../../../../common/pagination/offset-pagination";
import type { AuthenticatedUser } from "../../../auth/types/authenticated-request.interface";
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

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService
  ) {}

  presignUpload(
    actor: AuthenticatedUser,
    dto: PresignUploadDto
  ): PresignedUploadResult {
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
    const parentCount = [
      dto.companyId,
      dto.contactId,
      dto.dealId,
      dto.projectId,
      dto.invoiceId,
    ].filter((v) => v !== undefined).length;

    if (parentCount !== 1) {
      throw new BadRequestException({
        code: "DOCUMENT_REQUIRES_EXACTLY_ONE_PARENT",
        message:
          "A document must have exactly one parent: companyId, contactId, dealId, projectId, or invoiceId.",
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
    } else if (dto.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: dto.invoiceId, organization_id: actor.organizationId },
        select: { id: true },
      });
      if (!invoice) {
        throw new NotFoundException({
          code: "PARENT_NOT_FOUND",
          message: "Invoice not found in organization.",
        });
      }
    }

    this.storage.assertValidFile(dto.mimeType, dto.sizeBytes);

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

    return this.storage.generateDownloadUrl(
      doc.storage_key,
      doc.filename,
      doc.mime_type
    );
  }

  async delete(actor: AuthenticatedUser, id: string): Promise<Document> {
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
}

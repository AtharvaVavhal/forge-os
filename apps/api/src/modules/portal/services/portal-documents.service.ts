import { Injectable, NotFoundException } from "@nestjs/common";
import { Visibility } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import {
  buildOffsetMeta,
  offsetSkipTake,
  type ListEnvelope,
  type OffsetPaginationQueryDto,
} from "../../../common/pagination/offset-pagination";
import {
  StorageService,
  type PresignedDownloadResult,
} from "../../shared/documents/services/storage.service";
import type { AuthenticatedPortalUser } from "../types/authenticated-portal-request.interface";

@Injectable()
export class PortalDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async list(
    client: AuthenticatedPortalUser,
    query: OffsetPaginationQueryDto
  ): Promise<ListEnvelope<Record<string, unknown>>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const { skip, take } = offsetSkipTake(page, pageSize);

    const where = this.companyScopedWhere(client);

    const [rows, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          filename: true,
          mime_type: true,
          size_bytes: true,
          category: true,
          visibility: true,
          company_id: true,
          project_id: true,
          invoice_id: true,
          created_at: true,
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return { data: rows, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  async downloadUrl(
    client: AuthenticatedPortalUser,
    id: string
  ): Promise<PresignedDownloadResult> {
    const document = await this.prisma.document.findFirst({
      where: {
        ...this.companyScopedWhere(client),
        id,
      },
    });
    if (!document) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Document not found." });
    }
    return this.storage.generateDownloadUrl(
      document.storage_key,
      document.filename,
      document.mime_type
    );
  }

  /**
   * visibility=CLIENT_VISIBLE AND deleted_at IS NULL AND parent resolves
   * to ClientUser.company_id (Document 5 §11 / Document 6 §10).
   */
  private companyScopedWhere(client: AuthenticatedPortalUser) {
    return {
      organization_id: client.organizationId,
      visibility: Visibility.CLIENT_VISIBLE,
      deleted_at: null,
      OR: [
        { company_id: client.companyId },
        { project: { company_id: client.companyId } },
        { invoice: { company_id: client.companyId } },
        { deal: { company_id: client.companyId } },
        { contact: { company_id: client.companyId } },
      ],
    };
  }
}

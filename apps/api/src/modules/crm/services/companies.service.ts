import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Company, Prisma } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, offsetSkipTake, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type { CreateCompanyDto, ListCompaniesQueryDto, UpdateCompanyDto } from "../dto/company.dto";
import {
  assertTeamMemberMayViewCompanyOrContact,
  teamMemberScopedCompanyContactWhere,
} from "../policies/resource-authorization";

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: ListCompaniesQueryDto): Promise<ListEnvelope<Company>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.CompanyWhereInput = {
      organization_id: actor.organizationId,
      archived_at: query.archived ? { not: null } : null,
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {}),
      ...teamMemberScopedCompanyContactWhere(actor),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({ where, orderBy: { created_at: "desc" }, ...offsetSkipTake(page, pageSize) }),
      this.prisma.company.count({ where }),
    ]);

    return { data, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  /**
   * Direct GET-by-id shows archived companies too (Document 6 §3.2:
   * "direct get: NOT CURRENTLY DEFINED whether FOUNDER_ADMIN may open
   * archived (recommend allow with flag)" — implemented as "always allow
   * on direct fetch," the simplest reading of "recommend allow" that
   * doesn't invent an unspecified query-flag parameter).
   */
  async get(actor: AuthenticatedUser, id: string): Promise<Company> {
    assertTeamMemberMayViewCompanyOrContact(actor);
    const company = await this.prisma.company.findFirst({
      where: { id, organization_id: actor.organizationId },
    });
    if (!company) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Company not found." });
    }
    return company;
  }

  async create(actor: AuthenticatedUser, dto: CreateCompanyDto): Promise<Company> {
    return this.prisma.company.create({
      data: {
        organization_id: actor.organizationId,
        name: dto.name,
        gstin: dto.gstin,
        billing_state: dto.billingState,
        billing_address: dto.billingAddress,
        tags: dto.tags ?? [],
      },
    });
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateCompanyDto): Promise<Company> {
    await this.get(actor, id);
    return this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.gstin !== undefined ? { gstin: dto.gstin } : {}),
        ...(dto.billingState !== undefined ? { billing_state: dto.billingState } : {}),
        ...(dto.billingAddress !== undefined ? { billing_address: dto.billingAddress } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      },
    });
  }

  async archive(actor: AuthenticatedUser, id: string): Promise<Company> {
    const company = await this.get(actor, id);
    if (company.archived_at) {
      throw new ConflictException({ code: "COMPANY_ALREADY_ARCHIVED", message: "This company is already archived." });
    }
    return this.prisma.company.update({ where: { id }, data: { archived_at: new Date() } });
  }
}

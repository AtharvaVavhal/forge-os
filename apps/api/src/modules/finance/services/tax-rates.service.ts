import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, TaxRate } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, offsetSkipTake, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type { CreateTaxRateDto, ListTaxRatesQueryDto, UpdateTaxRateDto } from "../dto/tax-rate.dto";

/** Document 5 §8.5: "GET /tax-rates | finance.read; POST/PATCH /tax-rates | finance.manage / FOUNDER_ADMIN." No audit column. */
@Injectable()
export class TaxRatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: ListTaxRatesQueryDto): Promise<ListEnvelope<TaxRate>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sortDirection = (query.sort ?? "createdAt:desc").endsWith(":asc") ? "asc" : "desc";
    const where: Prisma.TaxRateWhereInput = { organization_id: actor.organizationId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.taxRate.findMany({ where, orderBy: { created_at: sortDirection }, ...offsetSkipTake(page, pageSize) }),
      this.prisma.taxRate.count({ where }),
    ]);

    return { data, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<TaxRate> {
    const taxRate = await this.prisma.taxRate.findFirst({ where: { id, organization_id: actor.organizationId } });
    if (!taxRate) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Tax rate not found." });
    }
    return taxRate;
  }

  async create(actor: AuthenticatedUser, dto: CreateTaxRateDto): Promise<TaxRate> {
    return this.prisma.taxRate.create({
      data: {
        organization_id: actor.organizationId,
        hsn_sac_code: dto.hsnSacCode,
        description: dto.description,
        cgst_rate: dto.cgstRate,
        sgst_rate: dto.sgstRate,
        igst_rate: dto.igstRate,
        effective_from: new Date(dto.effectiveFrom),
        effective_to: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      },
    });
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateTaxRateDto): Promise<TaxRate> {
    const taxRate = await this.get(actor, id);
    return this.prisma.taxRate.update({
      where: { id: taxRate.id },
      data: {
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.cgstRate !== undefined ? { cgst_rate: dto.cgstRate } : {}),
        ...(dto.sgstRate !== undefined ? { sgst_rate: dto.sgstRate } : {}),
        ...(dto.igstRate !== undefined ? { igst_rate: dto.igstRate } : {}),
        ...(dto.effectiveTo !== undefined ? { effective_to: new Date(dto.effectiveTo) } : {}),
      },
    });
  }
}

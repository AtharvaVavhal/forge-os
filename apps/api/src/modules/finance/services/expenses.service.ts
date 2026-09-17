import { Injectable, NotFoundException } from "@nestjs/common";
import type { Expense, Prisma } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, offsetSkipTake, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type { CreateExpenseDto, ListExpensesQueryDto, UpdateExpenseDto } from "../dto/expense.dto";
import { assertProjectInOrg, assertUserInOrg } from "./scope-guards";

const DETAIL_INCLUDE = { project: { select: { id: true, name: true } } };

/** Document 5 §8.3: "GET/POST /expenses | read/manage." No audit column for create/update — Expense isn't in Document 6 §17's Tier A list. */
@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: ListExpensesQueryDto): Promise<ListEnvelope<Expense>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sortDirection = (query.sort ?? "createdAt:desc").endsWith(":asc") ? "asc" : "desc";
    const where: Prisma.ExpenseWhereInput = { organization_id: actor.organizationId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        orderBy: { created_at: sortDirection },
        include: DETAIL_INCLUDE,
        ...offsetSkipTake(page, pageSize),
      }),
      this.prisma.expense.count({ where }),
    ]);

    return { data, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<Expense> {
    const expense = await this.prisma.expense.findFirst({
      where: { id, organization_id: actor.organizationId },
      include: DETAIL_INCLUDE,
    });
    if (!expense) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Expense not found." });
    }
    return expense;
  }

  async create(actor: AuthenticatedUser, dto: CreateExpenseDto): Promise<Expense> {
    if (dto.projectId) await assertProjectInOrg(this.prisma, dto.projectId, actor.organizationId);
    const recordedBy = dto.recordedBy ?? actor.id;
    await assertUserInOrg(this.prisma, recordedBy, actor.organizationId);

    return this.prisma.expense.create({
      data: {
        organization_id: actor.organizationId,
        project_id: dto.projectId,
        description: dto.description,
        amount: dto.amount,
        category: dto.category,
        incurred_at: new Date(dto.incurredAt),
        recorded_by: recordedBy,
      },
      include: DETAIL_INCLUDE,
    });
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateExpenseDto): Promise<Expense> {
    const expense = await this.get(actor, id);
    if (dto.projectId) await assertProjectInOrg(this.prisma, dto.projectId, actor.organizationId);

    return this.prisma.expense.update({
      where: { id: expense.id },
      data: {
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.incurredAt !== undefined ? { incurred_at: new Date(dto.incurredAt) } : {}),
        ...(dto.projectId !== undefined ? { project_id: dto.projectId } : {}),
      },
      include: DETAIL_INCLUDE,
    });
  }
}

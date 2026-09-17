import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Contact } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import {
  buildCursorMeta,
  cursorWhere,
  paginateCursorResult,
} from "../../../common/pagination/cursor-pagination";
import type { ListEnvelope } from "../../../common/pagination/offset-pagination";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type { CreateContactDto, ListContactsQueryDto, UpdateContactDto } from "../dto/contact.dto";
import {
  assertTeamMemberMayViewCompanyOrContact,
  teamMemberScopedCompanyContactWhere,
} from "../policies/resource-authorization";
import { assertCompanyInOrg } from "./scope-guards";

/**
 * Postgres error code for a unique-constraint violation (used for both
 * Prisma-declared `@@unique` and the raw-SQL partial unique index
 * `contacts_org_company_email_uidx` from prisma/sql/003_partial_uniques.sql
 * — Prisma surfaces both the same way, as `P2002`, since it reads the
 * error off the driver, not off its own schema knowledge of the index).
 */
const PRISMA_UNIQUE_VIOLATION = "P2002";

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: ListContactsQueryDto): Promise<ListEnvelope<Contact>> {
    const limit = query.limit ?? 25;

    const where: Prisma.ContactWhereInput = {
      organization_id: actor.organizationId,
      archived_at: query.archived ? { not: null } : null,
      ...(query.companyId ? { company_id: query.companyId } : {}),
      ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" as const } }, { email: { contains: query.q, mode: "insensitive" as const } }] } : {}),
      ...teamMemberScopedCompanyContactWhere(actor),
      ...cursorWhere(query.cursor),
    };

    const rows = await this.prisma.contact.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const { data, nextCursor } = paginateCursorResult(rows, limit);

    return { data, meta: { pagination: buildCursorMeta(limit, nextCursor) } };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<Contact> {
    assertTeamMemberMayViewCompanyOrContact(actor);
    const contact = await this.prisma.contact.findFirst({
      where: { id, organization_id: actor.organizationId },
    });
    if (!contact) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Contact not found." });
    }
    return contact;
  }

  async create(actor: AuthenticatedUser, dto: CreateContactDto): Promise<Contact> {
    if (dto.companyId) {
      await assertCompanyInOrg(this.prisma, dto.companyId, actor.organizationId);
    }

    try {
      return await this.prisma.contact.create({
        data: {
          organization_id: actor.organizationId,
          company_id: dto.companyId,
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
        },
      });
    } catch (error) {
      throwIfUniqueViolation(error);
      throw error;
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateContactDto): Promise<Contact> {
    await this.get(actor, id);
    if (dto.companyId) {
      await assertCompanyInOrg(this.prisma, dto.companyId, actor.organizationId);
    }

    try {
      return await this.prisma.contact.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.companyId !== undefined ? { company_id: dto.companyId } : {}),
        },
      });
    } catch (error) {
      throwIfUniqueViolation(error);
      throw error;
    }
  }

  async archive(actor: AuthenticatedUser, id: string): Promise<Contact> {
    const contact = await this.get(actor, id);
    if (contact.archived_at) {
      throw new ConflictException({ code: "CONTACT_ALREADY_ARCHIVED", message: "This contact is already archived." });
    }
    return this.prisma.contact.update({ where: { id }, data: { archived_at: new Date() } });
  }
}

/** Document 5 §5.2: "Duplicate create -> 409 CONTACT_EMAIL_EXISTS." */
function throwIfUniqueViolation(error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === PRISMA_UNIQUE_VIOLATION) {
    throw new ConflictException({
      code: "CONTACT_EMAIL_EXISTS",
      message: "A contact with this email already exists for this company.",
    });
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { LeadStatus, type Deal, type Lead, type Prisma } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, offsetSkipTake, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type { ConvertLeadDto, CreateLeadDto, ListLeadsQueryDto, UpdateLeadDto } from "../dto/lead.dto";
import { isValidLeadTransition, LEAD_AUDITED_TRANSITIONS } from "../policies/lead-state-machine";
import { assertCrmRoleMayAccessLeadsOrDeals } from "../policies/resource-authorization";
import { assertCompanyInOrg, assertContactInOrg, assertUserInOrg } from "./scope-guards";

export interface LeadConvertResult {
  lead: Lead;
  deal: Deal;
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(actor: AuthenticatedUser, query: ListLeadsQueryDto): Promise<ListEnvelope<Lead>> {
    assertCrmRoleMayAccessLeadsOrDeals(actor);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    // Document 5 §5.3 gives Leads no `archived` query param (unlike
    // Companies) — the Document 6 §3.2 default (exclude archived) applies
    // unconditionally here, with no client override.
    const where: Prisma.LeadWhereInput = {
      organization_id: actor.organizationId,
      archived_at: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.q ? { notes: { contains: query.q, mode: "insensitive" as const } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({ where, orderBy: { created_at: "desc" }, ...offsetSkipTake(page, pageSize) }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<Lead> {
    assertCrmRoleMayAccessLeadsOrDeals(actor);
    const lead = await this.prisma.lead.findFirst({ where: { id, organization_id: actor.organizationId } });
    if (!lead) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Lead not found." });
    }
    return lead;
  }

  async create(actor: AuthenticatedUser, dto: CreateLeadDto): Promise<Lead> {
    assertCrmRoleMayAccessLeadsOrDeals(actor);
    if (dto.companyId) await assertCompanyInOrg(this.prisma, dto.companyId, actor.organizationId);
    if (dto.contactId) await assertContactInOrg(this.prisma, dto.contactId, actor.organizationId);

    return this.prisma.lead.create({
      data: {
        organization_id: actor.organizationId,
        company_id: dto.companyId,
        contact_id: dto.contactId,
        source: dto.source,
        notes: dto.notes,
      },
    });
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateLeadDto): Promise<Lead> {
    const lead = await this.get(actor, id);
    if (dto.companyId) await assertCompanyInOrg(this.prisma, dto.companyId, actor.organizationId);
    if (dto.contactId) await assertContactInOrg(this.prisma, dto.contactId, actor.organizationId);

    return this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        ...(dto.companyId !== undefined ? { company_id: dto.companyId } : {}),
        ...(dto.contactId !== undefined ? { contact_id: dto.contactId } : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
  }

  /**
   * Document 5 §5.3/§12.1. `CONVERTED` is explicitly rejected here — it is
   * only reachable through `convert()` (see lead-state-machine.ts).
   */
  async transition(actor: AuthenticatedUser, id: string, to: LeadStatus): Promise<Lead> {
    const lead = await this.get(actor, id);

    if (to === LeadStatus.CONVERTED) {
      throw new BadRequestException({
        code: "LEAD_USE_CONVERT_ENDPOINT",
        message: "Use POST /leads/:id/convert to move a lead to CONVERTED.",
      });
    }
    if (!isValidLeadTransition(lead.status, to)) {
      throw new ConflictException({
        code: "LEAD_INVALID_TRANSITION",
        message: `Cannot transition a lead from ${lead.status} to ${to}.`,
        details: { from: lead.status, to },
      });
    }

    const updated = await this.prisma.lead.update({ where: { id: lead.id }, data: { status: to } });

    if (LEAD_AUDITED_TRANSITIONS.includes(to)) {
      await this.audit.record({
        organizationId: actor.organizationId,
        actorType: "USER",
        actorId: actor.id,
        action: AUDIT_ACTIONS.LEAD_TRANSITIONED,
        entityType: "Lead",
        entityId: lead.id,
        before: { status: lead.status },
        after: { status: to },
      });
    }

    return updated;
  }

  async archive(actor: AuthenticatedUser, id: string): Promise<Lead> {
    const lead = await this.get(actor, id);
    if (lead.archived_at) {
      throw new ConflictException({ code: "LEAD_ALREADY_ARCHIVED", message: "This lead is already archived." });
    }
    return this.prisma.lead.update({ where: { id: lead.id }, data: { archived_at: new Date() } });
  }

  /**
   * Lead -> Deal conversion (Document 5 §5.3 + task's explicit rules):
   * only from QUALIFIED, transactional, creates the Deal (client can never
   * supply a `dealId`), records `converted_to_deal_id`, never deletes the
   * Lead row, and is race-safe against duplicate conversion via a
   * conditional `updateMany` inside the transaction — see the inline
   * comment below for exactly how.
   */
  async convert(actor: AuthenticatedUser, id: string, dto: ConvertLeadDto): Promise<LeadConvertResult> {
    const lead = await this.get(actor, id);

    if (lead.status !== LeadStatus.QUALIFIED) {
      throw new ConflictException({
        code: "LEAD_CONVERT_REQUIRES_QUALIFIED",
        message: "A lead can only be converted to a deal from QUALIFIED status.",
        details: { status: lead.status },
      });
    }
    // Defense in depth against a race between two concurrent convert
    // calls that both read status=QUALIFIED before either commits — the
    // status check above is necessary but the conditional updateMany
    // inside the transaction below is what's actually race-safe.
    if (lead.converted_to_deal_id) {
      throw new ConflictException({
        code: "LEAD_ALREADY_CONVERTED",
        message: "This lead has already been converted to a deal.",
      });
    }

    const ownerId = dto.ownerId ?? actor.id;
    await assertUserInOrg(this.prisma, ownerId, actor.organizationId);

    const { lead: updatedLead, deal } = await this.prisma.$transaction(async (tx) => {
      // Carry company/contact context from the Lead (Document 5 §5.3) —
      // the client never supplies these for conversion, only the fields a
      // Deal needs that a Lead doesn't already have.
      const createdDeal = await tx.deal.create({
        data: {
          organization_id: actor.organizationId,
          title: dto.title,
          company_id: lead.company_id,
          contact_id: lead.contact_id,
          estimated_value: dto.estimatedValue,
          owner_id: ownerId,
        },
      });

      // Conditional update: only succeeds if the Lead is *still*
      // QUALIFIED and unconverted at the moment of the write — the
      // atomic guard against double-conversion. If another request won
      // the race between our two reads above and this write, `count`
      // will be 0 and we roll back (including the Deal insert above) by
      // throwing inside the transaction callback.
      const result = await tx.lead.updateMany({
        where: {
          id: lead.id,
          organization_id: actor.organizationId,
          status: LeadStatus.QUALIFIED,
          converted_to_deal_id: null,
        },
        data: { status: LeadStatus.CONVERTED, converted_to_deal_id: createdDeal.id },
      });
      if (result.count !== 1) {
        throw new ConflictException({
          code: "LEAD_ALREADY_CONVERTED",
          message: "This lead has already been converted to a deal.",
        });
      }

      const refreshedLead = await tx.lead.findUniqueOrThrow({ where: { id: lead.id } });
      return { lead: refreshedLead, deal: createdDeal };
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.LEAD_CONVERTED,
      entityType: "Lead",
      entityId: updatedLead.id,
      after: { dealId: deal.id },
    });

    return { lead: updatedLead, deal };
  }
}

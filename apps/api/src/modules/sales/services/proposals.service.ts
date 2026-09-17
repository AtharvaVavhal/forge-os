import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ProposalStatus, type Proposal } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, offsetSkipTake, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type {
  CreateProposalDto,
  ListProposalsQueryDto,
  ReplaceLineItemsDto,
  UpdateProposalDto,
} from "../dto/proposal.dto";
import {
  isProposalDraft,
  isProposalTerminal,
  isValidProposalTransition,
  timestampFieldFor,
} from "../policies/proposal-state-machine";
import { assertDealInOrg, assertTaxRateInOrg } from "./scope-guards";

/** Postgres unique-violation code — see crm/services/contacts.service.ts for the same pattern. */
const PRISMA_UNIQUE_VIOLATION = "P2002";

const DETAIL_INCLUDE = {
  line_items: { orderBy: { sort_order: "asc" as const } },
  deal: { select: { id: true, title: true } },
};

@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Document 5 §19: `GET /proposals` returns `list` (no `+lines`) — only
   * the detail route eager-loads line items. The `deal` summary relation
   * is included on both (the frontend's own `Proposal` type treats it as
   * a real, always-attempted field — see docs/IMPLEMENTATION-PHASE-B3.md).
   */
  async list(actor: AuthenticatedUser, query: ListProposalsQueryDto): Promise<ListEnvelope<Proposal>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    // Document 5 §2.5: sort is a per-resource whitelist — `createdAt` is
    // the only sortable field for Proposals, so only the direction varies.
    const sortDirection = (query.sort ?? "createdAt:desc").endsWith(":asc") ? "asc" : "desc";

    const where: Prisma.ProposalWhereInput = { organization_id: actor.organizationId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.proposal.findMany({
        where,
        orderBy: { created_at: sortDirection },
        include: { deal: { select: { id: true, title: true } } },
        ...offsetSkipTake(page, pageSize),
      }),
      this.prisma.proposal.count({ where }),
    ]);

    return { data, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<Proposal> {
    const proposal = await this.prisma.proposal.findFirst({
      where: { id, organization_id: actor.organizationId },
      include: DETAIL_INCLUDE,
    });
    if (!proposal) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Proposal not found." });
    }
    return proposal;
  }

  /** Document 5 §6.1: "creates version 1, DRAFT." No audit column — see the phase doc's reconciliation note. */
  async create(actor: AuthenticatedUser, dto: CreateProposalDto): Promise<Proposal> {
    await assertDealInOrg(this.prisma, dto.dealId, actor.organizationId);

    return this.prisma.proposal.create({
      data: {
        organization_id: actor.organizationId,
        deal_id: dto.dealId,
        version: 1,
        status: ProposalStatus.DRAFT,
        terms: dto.terms,
        created_by: actor.id,
      },
      include: DETAIL_INCLUDE,
    });
  }

  /** Document 5 §6.1: "only if status=DRAFT" — else `409 PROPOSAL_IMMUTABLE` (the spec's own literal error code). */
  async update(actor: AuthenticatedUser, id: string, dto: UpdateProposalDto): Promise<Proposal> {
    const proposal = await this.get(actor, id);
    this.assertDraft(proposal);

    return this.prisma.proposal.update({
      where: { id: proposal.id },
      data: { ...(dto.terms !== undefined ? { terms: dto.terms } : {}) },
      include: DETAIL_INCLUDE,
    });
  }

  /** `PUT /proposals/:id/line-items` — full replace, only if DRAFT, atomic (delete + recreate in one transaction). */
  async replaceLineItems(actor: AuthenticatedUser, id: string, dto: ReplaceLineItemsDto): Promise<Proposal> {
    const proposal = await this.get(actor, id);
    this.assertDraft(proposal);

    for (const line of dto.lines) {
      if (line.taxRateId) {
        await assertTaxRateInOrg(this.prisma, line.taxRateId, actor.organizationId);
      }
    }

    await this.prisma.$transaction([
      this.prisma.proposalLineItem.deleteMany({ where: { proposal_id: proposal.id } }),
      this.prisma.proposalLineItem.createMany({
        data: dto.lines.map((line, index) => ({
          organization_id: actor.organizationId,
          proposal_id: proposal.id,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          tax_rate_id: line.taxRateId,
          sort_order: line.sortOrder ?? index,
        })),
      }),
    ]);

    return this.get(actor, proposal.id);
  }

  /** `POST /proposals/:id/send` — DRAFT -> SENT only. Document 5 §19: Tier A audit. */
  async send(actor: AuthenticatedUser, id: string): Promise<Proposal> {
    const proposal = await this.get(actor, id);
    this.assertDraft(proposal);

    const updated = await this.prisma.proposal.update({
      where: { id: proposal.id },
      data: { status: ProposalStatus.SENT, sent_at: new Date() },
      include: DETAIL_INCLUDE,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.PROPOSAL_SENT,
      entityType: "Proposal",
      entityId: proposal.id,
      before: { status: proposal.status },
      after: { status: ProposalStatus.SENT },
    });

    return updated;
  }

  /**
   * `POST /proposals/:id/transition` — internal targets only: VIEWED,
   * REJECTED, EXPIRED (never ACCEPTED — see proposal-state-machine.ts).
   * Document 5 §12.3: "Audit all transitions (A)."
   */
  async transition(actor: AuthenticatedUser, id: string, to: ProposalStatus): Promise<Proposal> {
    const proposal = await this.get(actor, id);

    if (to === ProposalStatus.ACCEPTED) {
      throw new ConflictException({
        code: "PROPOSAL_ACCEPT_IS_PORTAL_ONLY",
        message: "Proposal acceptance happens through the client portal, not this internal endpoint.",
      });
    }
    if (!isValidProposalTransition(proposal.status, to)) {
      throw new ConflictException({
        code: "PROPOSAL_INVALID_TRANSITION",
        message: `Cannot transition a proposal from ${proposal.status} to ${to}.`,
        details: { from: proposal.status, to },
      });
    }

    const timestampField = timestampFieldFor(to);
    const updated = await this.prisma.proposal.update({
      where: { id: proposal.id },
      data: { status: to, ...(timestampField ? { [timestampField]: new Date() } : {}) },
      include: DETAIL_INCLUDE,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.PROPOSAL_TRANSITIONED,
      entityType: "Proposal",
      entityId: proposal.id,
      before: { status: proposal.status },
      after: { status: to },
    });

    return updated;
  }

  /**
   * `POST /proposals/:id/revise` — Document 5 §6.1: "if status != DRAFT:
   * create new row version+1 DRAFT copying lines; prior row frozen."
   *
   * Version numbering is optimistic (`MAX(version) + 1` for the deal,
   * read inside the transaction) but correctness depends on the DB's
   * `@@unique([organization_id, deal_id, version])` constraint, not on
   * that read being race-free — two concurrent revise() calls against
   * proposals on the same deal can both compute the same next version;
   * at most one INSERT succeeds, the other hits the unique constraint and
   * is caught below as a clean, documented conflict rather than a raw
   * 500 or (worse) a silently duplicated version. See
   * docs/IMPLEMENTATION-PHASE-B3.md for the concurrency test that proves
   * this holds under real simultaneous requests.
   */
  async revise(actor: AuthenticatedUser, id: string): Promise<Proposal> {
    const source = await this.get(actor, id);

    if (isProposalDraft(source.status)) {
      throw new ConflictException({
        code: "PROPOSAL_ALREADY_DRAFT",
        message: "This proposal is already a draft — edit it directly instead of revising.",
      });
    }

    try {
      const revised = await this.prisma.$transaction(async (tx) => {
        const maxVersion = await tx.proposal.aggregate({
          where: { organization_id: actor.organizationId, deal_id: source.deal_id },
          _max: { version: true },
        });
        const nextVersion = (maxVersion._max.version ?? 0) + 1;

        const created = await tx.proposal.create({
          data: {
            organization_id: actor.organizationId,
            deal_id: source.deal_id,
            version: nextVersion,
            status: ProposalStatus.DRAFT,
            terms: source.terms,
            created_by: actor.id,
          },
        });

        const sourceLines = await tx.proposalLineItem.findMany({
          where: { proposal_id: source.id },
          orderBy: { sort_order: "asc" },
        });
        if (sourceLines.length > 0) {
          await tx.proposalLineItem.createMany({
            data: sourceLines.map((line) => ({
              organization_id: actor.organizationId,
              proposal_id: created.id,
              description: line.description,
              quantity: line.quantity,
              unit_price: line.unit_price,
              tax_rate_id: line.tax_rate_id,
              sort_order: line.sort_order,
            })),
          });
        }

        return created;
      });

      await this.audit.record({
        organizationId: actor.organizationId,
        actorType: "USER",
        actorId: actor.id,
        action: AUDIT_ACTIONS.PROPOSAL_REVISED,
        entityType: "Proposal",
        entityId: revised.id,
        before: { sourceProposalId: source.id, sourceVersion: source.version },
        after: { newProposalId: revised.id, newVersion: revised.version },
      });

      return this.get(actor, revised.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === PRISMA_UNIQUE_VIOLATION) {
        throw new ConflictException({
          code: "PROPOSAL_REVISION_CONFLICT",
          message: "Another revision was created for this deal at the same time — please retry.",
        });
      }
      throw error;
    }
  }

  private assertDraft(proposal: Proposal): void {
    if (!isProposalDraft(proposal.status)) {
      const terminal = isProposalTerminal(proposal.status);
      throw new ConflictException({
        code: "PROPOSAL_IMMUTABLE",
        message: terminal
          ? "This proposal version is final and cannot be edited — use /revise to create a new draft."
          : "This proposal version is no longer a draft and cannot be edited — use /revise to create a new draft.",
        details: { status: proposal.status },
      });
    }
  }
}

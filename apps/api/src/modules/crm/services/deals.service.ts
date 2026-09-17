import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import {
  DealStage,
  ProjectPhase,
  ProjectStatus,
  ProposalStatus,
  type Deal,
  type Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, offsetSkipTake, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import { DOMAIN_EVENT_TYPES } from "../../outbox/domain-event.constants";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type {
  BulkReassignDealsDto,
  CreateDealDto,
  ListDealsQueryDto,
  ReopenDealDto,
  TransitionDealDto,
  UpdateDealDto,
} from "../dto/deal.dto";
import { DEAL_LINEAR_ORDER, isDealTerminal, nextLinearStage } from "../policies/deal-state-machine";
import { assertCrmRoleMayAccessLeadsOrDeals } from "../policies/resource-authorization";
import { assertCompanyInOrg, assertContactInOrg, assertUserInOrg } from "./scope-guards";

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(actor: AuthenticatedUser, query: ListDealsQueryDto): Promise<ListEnvelope<Deal>> {
    assertCrmRoleMayAccessLeadsOrDeals(actor);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.DealWhereInput = {
      organization_id: actor.organizationId,
      archived_at: null,
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.ownerId ? { owner_id: query.ownerId } : {}),
      ...(query.source ? { converted_leads: { some: { source: query.source } } } : {}),
      ...(query.q ? { title: { contains: query.q, mode: "insensitive" as const } } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            created_at: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.deal.findMany({ where, orderBy: { created_at: "desc" }, ...offsetSkipTake(page, pageSize) }),
      this.prisma.deal.count({ where }),
    ]);

    return { data, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<Deal> {
    assertCrmRoleMayAccessLeadsOrDeals(actor);
    const deal = await this.prisma.deal.findFirst({ where: { id, organization_id: actor.organizationId } });
    if (!deal) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Deal not found." });
    }
    return deal;
  }

  async create(actor: AuthenticatedUser, dto: CreateDealDto): Promise<Deal> {
    assertCrmRoleMayAccessLeadsOrDeals(actor);
    if (dto.companyId) await assertCompanyInOrg(this.prisma, dto.companyId, actor.organizationId);
    if (dto.contactId) await assertContactInOrg(this.prisma, dto.contactId, actor.organizationId);
    const ownerId = dto.ownerId ?? actor.id;
    await assertUserInOrg(this.prisma, ownerId, actor.organizationId);

    return this.prisma.deal.create({
      data: {
        organization_id: actor.organizationId,
        title: dto.title,
        company_id: dto.companyId,
        contact_id: dto.contactId,
        estimated_value: dto.estimatedValue,
        owner_id: ownerId,
      },
    });
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateDealDto): Promise<Deal> {
    const deal = await this.get(actor, id);
    if (dto.companyId) await assertCompanyInOrg(this.prisma, dto.companyId, actor.organizationId);
    if (dto.contactId) await assertContactInOrg(this.prisma, dto.contactId, actor.organizationId);
    if (dto.ownerId) await assertUserInOrg(this.prisma, dto.ownerId, actor.organizationId);

    return this.prisma.deal.update({
      where: { id: deal.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.companyId !== undefined ? { company_id: dto.companyId } : {}),
        ...(dto.contactId !== undefined ? { contact_id: dto.contactId } : {}),
        ...(dto.estimatedValue !== undefined ? { estimated_value: dto.estimatedValue } : {}),
        ...(dto.ownerId !== undefined ? { owner_id: dto.ownerId } : {}),
        ...(dto.nextFollowUpAt !== undefined ? { next_follow_up_at: new Date(dto.nextFollowUpAt) } : {}),
      },
    });
  }

  /**
   * Document 5 §12.2: from any non-terminal stage, "next stage" in the
   * linear path is always allowed; LOST/WON are allowed from *any*
   * non-terminal stage (not just adjacent) subject to their own
   * preconditions. WON/LOST are terminal — no transition out except via
   * `reopen()`.
   *
   * The WON precondition ("≥1 ACCEPTED proposal") queries the `Proposal`
   * table directly via Prisma — not through a `sales` module import
   * (Document 5 §1: crm must not import sales; no sales module exists to
   * import yet regardless). This is deliberate: per the task's own
   * instruction, "implement the CRM-side contract so the dependency
   * fails explicitly with the documented error rather than inventing
   * proposal data or bypassing the rule." Until B3 (Sales) ships an
   * endpoint that can actually create an ACCEPTED proposal, this check
   * will correctly reject *every* WON attempt in real usage — that is
   * the intended, correct behavior, not a bug (see
   * docs/IMPLEMENTATION-PHASE-B2.md).
   */
  async transition(actor: AuthenticatedUser, id: string, dto: TransitionDealDto): Promise<Deal> {
    const deal = await this.get(actor, id);

    if (isDealTerminal(deal.stage)) {
      throw new ConflictException({
        code: "DEAL_TERMINAL_STAGE",
        message: "A WON or LOST deal cannot be transitioned further — use /reopen to create a new deal.",
        details: { stage: deal.stage },
      });
    }

    if (dto.to === DealStage.LOST) {
      if (!dto.lostReason) {
        throw new BadRequestException({
          code: "DEAL_LOST_REASON_REQUIRED",
          message: "A lost reason is required to mark a deal LOST.",
        });
      }
      return this.applyTransition(actor, deal, DealStage.LOST, { lost_reason: dto.lostReason });
    }

    if (dto.to === DealStage.WON) {
      const acceptedProposal = await this.prisma.proposal.findFirst({
        where: { deal_id: deal.id, status: ProposalStatus.ACCEPTED },
        select: { id: true },
        orderBy: { version: "desc" },
      });
      if (!acceptedProposal) {
        throw new UnprocessableEntityException({
          code: "DEAL_WON_REQUIRES_ACCEPTED_PROPOSAL",
          message: "Deal cannot move to WON without an accepted proposal.",
          details: { dealId: deal.id },
        });
      }
      return this.applyWonTransition(actor, deal, acceptedProposal.id);
    }

    const next = nextLinearStage(deal.stage);
    if (!next || dto.to !== next) {
      throw new ConflictException({
        code: "DEAL_INVALID_TRANSITION",
        message: `Cannot transition a deal from ${deal.stage} to ${dto.to}.`,
        details: { from: deal.stage, to: dto.to, linearOrder: DEAL_LINEAR_ORDER },
      });
    }
    return this.applyTransition(actor, deal, next, {});
  }

  /**
   * Document 5 §13 / Red Team §3 — single DB transaction:
   * Deal stage → WON + Project create + DomainEvent(DealWon).
   * Idempotent on retry: one Project per deal; one DealWon event per deal.
   */
  private async applyWonTransition(
    actor: AuthenticatedUser,
    deal: Deal,
    acceptedProposalId: string
  ): Promise<Deal> {
    if (!deal.company_id) {
      throw new UnprocessableEntityException({
        code: "DEAL_COMPANY_REQUIRED",
        message: "Deal must have a company before it can be marked WON (required for Project).",
        details: { dealId: deal.id },
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const stageUpdate = await tx.deal.updateMany({
        where: {
          id: deal.id,
          organization_id: actor.organizationId,
          stage: { notIn: [DealStage.WON, DealStage.LOST] },
        },
        data: { stage: DealStage.WON },
      });

      if (stageUpdate.count !== 1) {
        const current = await tx.deal.findFirst({
          where: { id: deal.id, organization_id: actor.organizationId },
        });
        if (current?.stage === DealStage.WON) {
          // Concurrent/retry: already WON — ensure Project + event exist, return deal.
          const project =
            (await tx.project.findFirst({
              where: { deal_id: deal.id, organization_id: actor.organizationId },
            })) ??
            (await tx.project.create({
              data: {
                organization_id: actor.organizationId,
                name: deal.title,
                company_id: deal.company_id!,
                deal_id: deal.id,
                accepted_proposal_id: acceptedProposalId,
                owner_id: deal.owner_id,
                status: ProjectStatus.ACTIVE,
                phase: ProjectPhase.PLANNING,
              },
            }));
          const existingEvent = await tx.domainEvent.findFirst({
            where: {
              organization_id: actor.organizationId,
              type: DOMAIN_EVENT_TYPES.DEAL_WON,
              aggregate_id: deal.id,
            },
          });
          if (!existingEvent) {
            await tx.domainEvent.create({
              data: {
                organization_id: actor.organizationId,
                type: DOMAIN_EVENT_TYPES.DEAL_WON,
                aggregate_type: "Deal",
                aggregate_id: deal.id,
                payload: {
                  dealId: deal.id,
                  projectId: project.id,
                  acceptedProposalId,
                  companyId: deal.company_id,
                  ownerId: deal.owner_id,
                },
              },
            });
          }
          return tx.deal.findFirstOrThrow({ where: { id: deal.id } });
        }
        throw new ConflictException({
          code: "DEAL_INVALID_TRANSITION",
          message: `Cannot transition a deal from ${current?.stage ?? "unknown"} to WON.`,
          details: { from: current?.stage, to: DealStage.WON },
        });
      }

      let project = await tx.project.findFirst({
        where: { deal_id: deal.id, organization_id: actor.organizationId },
      });
      if (!project) {
        project = await tx.project.create({
          data: {
            organization_id: actor.organizationId,
            name: deal.title,
            company_id: deal.company_id!,
            deal_id: deal.id,
            accepted_proposal_id: acceptedProposalId,
            owner_id: deal.owner_id,
            status: ProjectStatus.ACTIVE,
            phase: ProjectPhase.PLANNING,
          },
        });
      }

      const existingEvent = await tx.domainEvent.findFirst({
        where: {
          organization_id: actor.organizationId,
          type: DOMAIN_EVENT_TYPES.DEAL_WON,
          aggregate_id: deal.id,
        },
      });
      if (!existingEvent) {
        await tx.domainEvent.create({
          data: {
            organization_id: actor.organizationId,
            type: DOMAIN_EVENT_TYPES.DEAL_WON,
            aggregate_type: "Deal",
            aggregate_id: deal.id,
            payload: {
              dealId: deal.id,
              projectId: project.id,
              acceptedProposalId,
              companyId: deal.company_id,
              ownerId: deal.owner_id,
            },
          },
        });
      }

      return tx.deal.findFirstOrThrow({ where: { id: deal.id } });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.DEAL_TRANSITIONED,
      entityType: "Deal",
      entityId: deal.id,
      before: { stage: deal.stage },
      after: { stage: DealStage.WON },
    });

    return result;
  }

  private async applyTransition(
    actor: AuthenticatedUser,
    deal: Deal,
    to: DealStage,
    extra: Prisma.DealUpdateInput
  ): Promise<Deal> {
    // Non-WON transitions: stage + audit only (WON uses applyWonTransition).
    const updated = await this.prisma.deal.update({
      where: { id: deal.id },
      data: { stage: to, ...extra },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.DEAL_TRANSITIONED,
      entityType: "Deal",
      entityId: deal.id,
      before: { stage: deal.stage },
      after: { stage: to },
    });

    return updated;
  }

  async reopen(actor: AuthenticatedUser, id: string, dto: ReopenDealDto): Promise<Deal> {
    const deal = await this.get(actor, id);
    if (!isDealTerminal(deal.stage)) {
      throw new ConflictException({
        code: "DEAL_REOPEN_REQUIRES_TERMINAL_STAGE",
        message: "Only a WON or LOST deal can be reopened.",
        details: { stage: deal.stage },
      });
    }

    const ownerId = dto.ownerId ?? deal.owner_id;
    if (dto.ownerId) await assertUserInOrg(this.prisma, dto.ownerId, actor.organizationId);

    const reopened = await this.prisma.deal.create({
      data: {
        organization_id: actor.organizationId,
        title: dto.title ?? deal.title,
        company_id: deal.company_id,
        contact_id: deal.contact_id,
        estimated_value: dto.estimatedValue ?? deal.estimated_value,
        owner_id: ownerId,
        reopened_from_deal_id: deal.id,
      },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.DEAL_REOPENED,
      entityType: "Deal",
      entityId: reopened.id,
      before: { reopenedFromDealId: deal.id },
      after: { dealId: reopened.id },
    });

    return reopened;
  }

  async archive(actor: AuthenticatedUser, id: string): Promise<Deal> {
    const deal = await this.get(actor, id);
    if (deal.archived_at) {
      throw new ConflictException({ code: "DEAL_ALREADY_ARCHIVED", message: "This deal is already archived." });
    }
    return this.prisma.deal.update({ where: { id: deal.id }, data: { archived_at: new Date() } });
  }

  /** Document 5 §5.4/§19: `POST /deals/bulk-reassign` — owner-only, Tier B audit. */
  async bulkReassign(actor: AuthenticatedUser, dto: BulkReassignDealsDto): Promise<{ count: number }> {
    assertCrmRoleMayAccessLeadsOrDeals(actor);
    await assertUserInOrg(this.prisma, dto.ownerId, actor.organizationId);

    const result = await this.prisma.deal.updateMany({
      where: { id: { in: dto.ids }, organization_id: actor.organizationId },
      data: { owner_id: dto.ownerId },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.DEAL_BULK_REASSIGNED,
      entityType: "Deal",
      // AuditLog.entity_id is a single required UUID — a bulk op has no
      // one natural entity to name, so this records the new owner as the
      // subject and the affected ids in `after` for full traceability.
      entityId: dto.ownerId,
      after: { dealIds: dto.ids, newOwnerId: dto.ownerId, count: result.count },
    });

    return { count: result.count };
  }
}

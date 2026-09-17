import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ProposalStatus } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import {
  buildOffsetMeta,
  offsetSkipTake,
  type ListEnvelope,
} from "../../../common/pagination/offset-pagination";
import type { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import type { AuthenticatedPortalUser } from "../types/authenticated-portal-request.interface";

@Injectable()
export class PortalProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(
    client: AuthenticatedPortalUser,
    query: OffsetPaginationQueryDto
  ): Promise<ListEnvelope<Record<string, unknown>>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const { skip, take } = offsetSkipTake(page, pageSize);

    const where = {
      organization_id: client.organizationId,
      status: { not: ProposalStatus.DRAFT },
      deal: { company_id: client.companyId },
    };

    const [rows, total] = await Promise.all([
      this.prisma.proposal.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: "desc" },
        include: {
          line_items: { orderBy: { sort_order: "asc" } },
          deal: { select: { id: true, title: true, company_id: true } },
        },
      }),
      this.prisma.proposal.count({ where }),
    ]);

    return { data: rows, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  async get(client: AuthenticatedPortalUser, id: string): Promise<Record<string, unknown>> {
    const proposal = await this.findScopedProposal(client, id);

    if (proposal.status === ProposalStatus.SENT) {
      const transitioned = await this.prisma.proposal.updateMany({
        where: { id: proposal.id, status: ProposalStatus.SENT },
        data: {
          status: ProposalStatus.VIEWED,
          viewed_at: proposal.viewed_at ?? new Date(),
        },
      });

      if (transitioned.count === 1) {
        await this.audit.record({
          organizationId: client.organizationId,
          actorType: "CLIENT_USER",
          actorId: client.id,
          action: AUDIT_ACTIONS.PROPOSAL_TRANSITIONED,
          entityType: "Proposal",
          entityId: proposal.id,
          before: { status: ProposalStatus.SENT },
          after: { status: ProposalStatus.VIEWED },
        });
      }

      return this.findScopedProposal(client, id);
    }

    return proposal;
  }

  /**
   * Document 5 §6.1 / §11 / §13: SENT|VIEWED → ACCEPTED only.
   * Does NOT auto-Won the Deal. Sets `accepted_at`. Inserts DomainEvent.
   * Concurrency: updateMany with status filter — exactly one winner.
   */
  async accept(client: AuthenticatedPortalUser, id: string): Promise<Record<string, unknown>> {
    // Scope check first (404 for cross-company) before concurrency race.
    await this.findScopedProposal(client, id);

    const acceptedAt = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      // updateMany cannot filter on relations — constrain by id + status only
      // after the company-scoped find above. Concurrent accepts: exactly one
      // updateMany returns count=1.
      const updated = await tx.proposal.updateMany({
        where: {
          id,
          organization_id: client.organizationId,
          status: { in: [ProposalStatus.SENT, ProposalStatus.VIEWED] },
        },
        data: {
          status: ProposalStatus.ACCEPTED,
          accepted_at: acceptedAt,
        },
      });

      if (updated.count !== 1) {
        const current = await tx.proposal.findFirst({
          where: {
            id,
            organization_id: client.organizationId,
            deal: { company_id: client.companyId },
          },
        });
        if (!current) {
          throw new NotFoundException({ code: "NOT_FOUND", message: "Proposal not found." });
        }
        throw new ConflictException({
          code: "PROPOSAL_NOT_ACCEPTABLE",
          message: `A proposal in status ${current.status} cannot be accepted.`,
          details: { status: current.status },
        });
      }

      await tx.domainEvent.create({
        data: {
          organization_id: client.organizationId,
          type: "ProposalAccepted",
          aggregate_type: "Proposal",
          aggregate_id: id,
          payload: {
            proposalId: id,
            acceptedByClientUserId: client.id,
            acceptedAt: acceptedAt.toISOString(),
          },
        },
      });

      return tx.proposal.findFirstOrThrow({
        where: { id },
        include: {
          line_items: { orderBy: { sort_order: "asc" } },
          deal: { select: { id: true, title: true, company_id: true } },
        },
      });
    });

    await this.audit.record({
      organizationId: client.organizationId,
      actorType: "CLIENT_USER",
      actorId: client.id,
      action: AUDIT_ACTIONS.PROPOSAL_ACCEPTED,
      entityType: "Proposal",
      entityId: id,
      before: { status: "SENT_OR_VIEWED" },
      after: { status: ProposalStatus.ACCEPTED, acceptedAt: acceptedAt.toISOString() },
    });

    return result;
  }

  private async findScopedProposal(client: AuthenticatedPortalUser, id: string) {
    const proposal = await this.prisma.proposal.findFirst({
      where: {
        id,
        organization_id: client.organizationId,
        status: { not: ProposalStatus.DRAFT },
        deal: { company_id: client.companyId },
      },
      include: {
        line_items: { orderBy: { sort_order: "asc" } },
        deal: { select: { id: true, title: true, company_id: true } },
      },
    });
    if (!proposal) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Proposal not found." });
    }
    return proposal;
  }
}

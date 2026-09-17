import { BadRequestException, Injectable } from "@nestjs/common";
import type { Activity, Prisma } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import {
  buildCursorMeta,
  cursorWhere,
  paginateCursorResult,
} from "../../../common/pagination/cursor-pagination";
import type { ListEnvelope } from "../../../common/pagination/offset-pagination";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type { CreateActivityDto, ListActivitiesQueryDto } from "../dto/activity.dto";
import { assertCanCreateActivity, teamMemberScopedActivityWhere } from "../policies/resource-authorization";
import { assertCompanyInOrg, assertContactInOrg, assertDealInOrg } from "./scope-guards";

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: ListActivitiesQueryDto): Promise<ListEnvelope<Activity>> {
    const limit = query.limit ?? 25;

    const where: Prisma.ActivityWhereInput = {
      organization_id: actor.organizationId,
      ...(query.companyId ? { company_id: query.companyId } : {}),
      ...(query.contactId ? { contact_id: query.contactId } : {}),
      ...(query.dealId ? { deal_id: query.dealId } : {}),
      ...teamMemberScopedActivityWhere(actor),
      ...cursorWhere(query.cursor),
    };

    const rows = await this.prisma.activity.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const { data, nextCursor } = paginateCursorResult(rows, limit);

    return { data, meta: { pagination: buildCursorMeta(limit, nextCursor) } };
  }

  /**
   * "Supported parent relationships only" (B2 scope): exactly one of
   * company/contact/deal — never `project` (Projects doesn't exist yet;
   * see policies/resource-authorization.ts and activity.dto.ts). This
   * mirrors the DB CHECK constraint's "exactly one parent" invariant for
   * the subset of parent types B2 can populate.
   *
   * Document 5 §5.5: optional `nextFollowUpAt`, valid only when the
   * parent is a Deal — when present, also updates `Deal.next_follow_up_at`
   * as one atomic UX action.
   */
  async create(actor: AuthenticatedUser, dto: CreateActivityDto): Promise<Activity> {
    assertCanCreateActivity(actor);

    const parentCount = [dto.companyId, dto.contactId, dto.dealId].filter((v) => v !== undefined).length;
    if (parentCount !== 1) {
      throw new BadRequestException({
        code: "ACTIVITY_REQUIRES_EXACTLY_ONE_PARENT",
        message: "An activity must have exactly one of companyId, contactId, or dealId.",
      });
    }
    if (dto.nextFollowUpAt !== undefined && !dto.dealId) {
      throw new BadRequestException({
        code: "ACTIVITY_FOLLOW_UP_REQUIRES_DEAL",
        message: "nextFollowUpAt is only valid when the activity's parent is a deal.",
      });
    }

    if (dto.companyId) await assertCompanyInOrg(this.prisma, dto.companyId, actor.organizationId);
    if (dto.contactId) await assertContactInOrg(this.prisma, dto.contactId, actor.organizationId);
    if (dto.dealId) await assertDealInOrg(this.prisma, dto.dealId, actor.organizationId);

    if (dto.dealId && dto.nextFollowUpAt !== undefined) {
      const [activity] = await this.prisma.$transaction([
        this.prisma.activity.create({ data: this.buildCreateData(actor, dto) }),
        this.prisma.deal.update({
          where: { id: dto.dealId },
          data: { next_follow_up_at: new Date(dto.nextFollowUpAt) },
        }),
      ]);
      return activity;
    }

    return this.prisma.activity.create({ data: this.buildCreateData(actor, dto) });
  }

  private buildCreateData(actor: AuthenticatedUser, dto: CreateActivityDto): Prisma.ActivityCreateInput {
    return {
      organization: { connect: { id: actor.organizationId } },
      type: dto.type,
      summary: dto.summary,
      occurred_at: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
      company: dto.companyId ? { connect: { id: dto.companyId } } : undefined,
      contact: dto.contactId ? { connect: { id: dto.contactId } } : undefined,
      deal: dto.dealId ? { connect: { id: dto.dealId } } : undefined,
      creator: { connect: { id: actor.id } },
    };
  }
}

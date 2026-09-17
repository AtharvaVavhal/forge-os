import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { ProposalsService } from "../services/proposals.service";
import {
  CreateProposalDto,
  ListProposalsQueryDto,
  ReplaceLineItemsDto,
  TransitionProposalDto,
  UpdateProposalDto,
} from "../dto/proposal.dto";

/**
 * Document 5 §6.1/§19. Gated on `sales.read`/`sales.manage` — the
 * existing frozen permission catalog already grants exactly the right
 * roles (FOUNDER_ADMIN full, OPERATIONS/FINANCE read-only, SALES full,
 * TEAM_MEMBER neither) with no gaps to patch via a resource-authorization
 * layer, unlike B2's Leads/Deals/Activities — see
 * docs/IMPLEMENTATION-PHASE-B3.md.
 */
@Controller("proposals")
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @RequirePermissions("sales.read")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListProposalsQueryDto) {
    return this.proposals.list(user, query);
  }

  @RequirePermissions("sales.read")
  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.proposals.get(user, id);
  }

  @RequirePermissions("sales.manage")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProposalDto) {
    return this.proposals.create(user, dto);
  }

  @RequirePermissions("sales.manage")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProposalDto
  ) {
    return this.proposals.update(user, id, dto);
  }

  @RequirePermissions("sales.manage")
  @Put(":id/line-items")
  replaceLineItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReplaceLineItemsDto
  ) {
    return this.proposals.replaceLineItems(user, id, dto);
  }

  @RequirePermissions("sales.manage")
  @HttpCode(200)
  @Post(":id/send")
  send(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.proposals.send(user, id);
  }

  @RequirePermissions("sales.manage")
  @HttpCode(200)
  @Post(":id/revise")
  revise(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.proposals.revise(user, id);
  }

  @RequirePermissions("sales.manage")
  @HttpCode(200)
  @Post(":id/transition")
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TransitionProposalDto
  ) {
    return this.proposals.transition(user, id, dto.to);
  }
}

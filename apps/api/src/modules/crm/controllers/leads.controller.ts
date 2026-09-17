import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { LeadsService } from "../services/leads.service";
import {
  ConvertLeadDto,
  CreateLeadDto,
  ListLeadsQueryDto,
  TransitionLeadDto,
  UpdateLeadDto,
} from "../dto/lead.dto";

/**
 * Document 5 §5.3. Gated on `crm.read`/`crm.manage` (the coarse Document 5
 * §4.2 permission) plus `assertCrmRoleMayAccessLeadsOrDeals` inside the
 * service, which additionally denies TEAM_MEMBER outright (Document 6
 * §2.3 marks Leads "—" for TEAM_MEMBER, not "L") — see
 * policies/resource-authorization.ts.
 */
@Controller("leads")
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @RequirePermissions("crm.read")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListLeadsQueryDto) {
    return this.leads.list(user, query);
  }

  @RequirePermissions("crm.read")
  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.leads.get(user, id);
  }

  @RequirePermissions("crm.manage")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeadDto) {
    return this.leads.create(user, dto);
  }

  @RequirePermissions("crm.manage")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto
  ) {
    return this.leads.update(user, id, dto);
  }

  @RequirePermissions("crm.manage")
  @HttpCode(200)
  @Post(":id/transition")
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TransitionLeadDto
  ) {
    return this.leads.transition(user, id, dto.to);
  }

  @RequirePermissions("crm.manage")
  @HttpCode(200)
  @Post(":id/convert")
  convert(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ConvertLeadDto
  ) {
    return this.leads.convert(user, id, dto);
  }

  @RequirePermissions("crm.manage")
  @HttpCode(200)
  @Post(":id/archive")
  archive(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.leads.archive(user, id);
  }
}

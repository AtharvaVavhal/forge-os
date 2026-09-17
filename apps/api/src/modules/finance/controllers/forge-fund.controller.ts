import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Idempotent } from "../../../common/idempotency/idempotent.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { ForgeFundService } from "../services/forge-fund.service";
import { CreateForgeFundEntryDto, ListForgeFundEntriesQueryDto } from "../dto/forge-fund.dto";

/**
 * Document 5 §8.4/§19 — two distinct route prefixes (`/forge-fund-entries`
 * and `/forge-fund/balance`), so both are handled on one bare
 * `@Controller()` rather than splitting into two controller classes for
 * what's really one small resource.
 */
@Controller()
export class ForgeFundController {
  constructor(private readonly forgeFund: ForgeFundService) {}

  @RequirePermissions("forge_fund.read")
  @Get("forge-fund-entries")
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListForgeFundEntriesQueryDto) {
    return this.forgeFund.list(user, query);
  }

  @RequirePermissions("forge_fund.read")
  @Get("forge-fund-entries/:id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.forgeFund.get(user, id);
  }

  @RequirePermissions("forge_fund.read")
  @Get("forge-fund/balance")
  balance(@CurrentUser() user: AuthenticatedUser) {
    return this.forgeFund.balance(user);
  }

  // Controller-level `@RequirePermissions("forge_fund.manage")` handles
  // baseline reachability; the AND-combined `forge_fund.approve`
  // requirement (Document 5 §8.4: "forge_fund.manage + forge_fund.approve")
  // is enforced inside ForgeFundService.create — see its own doc comment.
  @RequirePermissions("forge_fund.manage")
  @Idempotent()
  @Post("forge-fund-entries")
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateForgeFundEntryDto) {
    return this.forgeFund.create(user, dto);
  }
}

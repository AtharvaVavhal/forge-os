import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Idempotent } from "../../../common/idempotency/idempotent.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { RefundsService } from "../services/refunds.service";
import { CreateRefundDto, ListRefundsQueryDto } from "../dto/refund.dto";

/** Document 5 §8.3/§19. */
@Controller("refunds")
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @RequirePermissions("finance.read")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListRefundsQueryDto) {
    return this.refunds.list(user, query);
  }

  @RequirePermissions("finance.manage")
  @Idempotent()
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRefundDto) {
    return this.refunds.create(user, dto);
  }
}

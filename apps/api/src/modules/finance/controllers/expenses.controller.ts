import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { ExpensesService } from "../services/expenses.service";
import { CreateExpenseDto, ListExpensesQueryDto, UpdateExpenseDto } from "../dto/expense.dto";

/**
 * Document 5 §8.3/§19 lists only `GET/POST /expenses` and
 * `PATCH /expenses/:id` — no `GET /expenses/:id` — so no detail route is
 * exposed here (Step 19: "no undocumented routes"). `ExpensesService.get`
 * still exists and is used internally by `update()`. Expenses are not in
 * Document 5 §2.7's Idempotency-Key required set.
 */
@Controller("expenses")
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @RequirePermissions("finance.read")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListExpensesQueryDto) {
    return this.expenses.list(user, query);
  }

  @RequirePermissions("finance.manage")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(user, dto);
  }

  @RequirePermissions("finance.manage")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto
  ) {
    return this.expenses.update(user, id, dto);
  }
}

import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { TaxRatesService } from "../services/tax-rates.service";
import { CreateTaxRateDto, ListTaxRatesQueryDto, UpdateTaxRateDto } from "../dto/tax-rate.dto";

/** Document 5 §8.5/§19 — lists only `GET`, `POST`, `PATCH /tax-rates/:id`; no `GET /tax-rates/:id` detail route. */
@Controller("tax-rates")
export class TaxRatesController {
  constructor(private readonly taxRates: TaxRatesService) {}

  @RequirePermissions("finance.read")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTaxRatesQueryDto) {
    return this.taxRates.list(user, query);
  }

  @RequirePermissions("finance.manage")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaxRateDto) {
    return this.taxRates.create(user, dto);
  }

  @RequirePermissions("finance.manage")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxRateDto
  ) {
    return this.taxRates.update(user, id, dto);
  }
}

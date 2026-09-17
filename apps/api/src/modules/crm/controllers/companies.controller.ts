import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { CompaniesService } from "../services/companies.service";
import { CreateCompanyDto, ListCompaniesQueryDto, UpdateCompanyDto } from "../dto/company.dto";

/** Document 5 §5.1. Plural noun, `/api/v1` base (set globally in main.ts). */
@Controller("companies")
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @RequirePermissions("crm.read")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCompaniesQueryDto) {
    return this.companies.list(user, query);
  }

  @RequirePermissions("crm.read")
  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.companies.get(user, id);
  }

  @RequirePermissions("crm.manage")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCompanyDto) {
    return this.companies.create(user, dto);
  }

  @RequirePermissions("crm.manage")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto
  ) {
    return this.companies.update(user, id, dto);
  }

  @RequirePermissions("crm.manage")
  @HttpCode(200)
  @Post(":id/archive")
  archive(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.companies.archive(user, id);
  }
}

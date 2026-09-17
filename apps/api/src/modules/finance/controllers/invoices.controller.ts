import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Idempotent } from "../../../common/idempotency/idempotent.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { InvoicesService } from "../services/invoices.service";
import {
  CancelInvoiceDto,
  CreateInvoiceDto,
  CreateInvoiceFromProposalDto,
  ListInvoicesQueryDto,
  ReplaceInvoiceLineItemsDto,
  UpdateInvoiceDto,
} from "../dto/invoice.dto";

/** Document 5 §8.1/§19. */
@Controller("invoices")
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @RequirePermissions("finance.read")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListInvoicesQueryDto) {
    return this.invoices.list(user, query);
  }

  @RequirePermissions("finance.read")
  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.invoices.get(user, id);
  }

  @RequirePermissions("finance.manage")
  @Idempotent()
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInvoiceDto) {
    return this.invoices.create(user, dto);
  }

  @RequirePermissions("finance.manage")
  @Idempotent()
  @Post("from-proposal")
  createFromProposal(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInvoiceFromProposalDto) {
    return this.invoices.createFromProposal(user, dto);
  }

  @RequirePermissions("finance.manage")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto
  ) {
    return this.invoices.update(user, id, dto);
  }

  @RequirePermissions("finance.manage")
  @Put(":id/line-items")
  replaceLineItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReplaceInvoiceLineItemsDto
  ) {
    return this.invoices.replaceLineItems(user, id, dto);
  }

  @RequirePermissions("finance.manage")
  @Idempotent()
  @HttpCode(200)
  @Post(":id/send")
  send(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.invoices.send(user, id);
  }

  @RequirePermissions("finance.manage")
  @HttpCode(200)
  @Post(":id/void")
  void_(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.invoices.void(user, id);
  }

  @RequirePermissions("finance.manage")
  @HttpCode(200)
  @Post(":id/cancel")
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CancelInvoiceDto
  ) {
    return this.invoices.cancel(user, id, dto);
  }

  @RequirePermissions("finance.manage")
  @HttpCode(202)
  @Post(":id/remind")
  async remind(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.invoices.remind(user, id);
  }
}

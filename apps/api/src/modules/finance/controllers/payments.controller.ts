import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Idempotent } from "../../../common/idempotency/idempotent.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { PaymentsService } from "../services/payments.service";
import { RazorpayOrdersService } from "../services/razorpay-orders.service";
import { CreatePaymentDto, CreateRazorpayOrderDto, ListPaymentsQueryDto } from "../dto/payment.dto";

/** Document 5 §8.2/§19. */
@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly razorpayOrders: RazorpayOrdersService
  ) {}

  @RequirePermissions("finance.read")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListPaymentsQueryDto) {
    return this.payments.list(user, query);
  }

  @RequirePermissions("finance.read")
  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.payments.get(user, id);
  }

  @RequirePermissions("finance.manage")
  @Idempotent()
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePaymentDto) {
    return this.payments.create(user, dto);
  }

  @RequirePermissions("finance.manage")
  @HttpCode(200)
  @Post("razorpay/orders")
  createOrder(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRazorpayOrderDto) {
    return this.razorpayOrders.createOrderForInvoice(user, dto.invoiceId);
  }
}

import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";
import { IsMoneyString } from "../../../common/validation/money";

/** Document 5 §8.2: "manual/offline only... method != RAZORPAY." RAZORPAY is deliberately excluded from this enum. */
export enum OfflinePaymentMethod {
  CASH = "CASH",
  BANK_TRANSFER = "BANK_TRANSFER",
  CHEQUE = "CHEQUE",
}

export class CreatePaymentDto {
  @IsUUID()
  invoiceId!: string;

  @IsMoneyString()
  amount!: string;

  @IsEnum(OfflinePaymentMethod)
  method!: OfflinePaymentMethod;

  /** Defaults to the acting user if omitted — see docs/IMPLEMENTATION-PHASE-B5.md. */
  @IsOptional()
  @IsUUID()
  recordedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  referenceNote?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class CreateRazorpayOrderDto {
  @IsUUID()
  invoiceId!: string;
}

export class ListPaymentsQueryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsIn(["createdAt:asc", "createdAt:desc"])
  sort?: "createdAt:asc" | "createdAt:desc";
}

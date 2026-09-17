import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";
import { IsMoneyString } from "../../../common/validation/money";

export class CreateRefundDto {
  @IsUUID()
  paymentId!: string;

  @IsMoneyString()
  amount!: string;

  @IsString()
  @MaxLength(2000)
  reason!: string;
}

export class ListRefundsQueryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsIn(["createdAt:asc", "createdAt:desc"])
  sort?: "createdAt:asc" | "createdAt:desc";
}

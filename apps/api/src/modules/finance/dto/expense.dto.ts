import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";
import { IsMoneyString } from "../../../common/validation/money";

export class CreateExpenseDto {
  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsMoneyString()
  amount!: string;

  @IsString()
  @MaxLength(100)
  category!: string;

  @IsDateString()
  incurredAt!: string;

  /** Defaults to the acting user if omitted — see docs/IMPLEMENTATION-PHASE-B5.md. */
  @IsOptional()
  @IsUUID()
  recordedBy?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsMoneyString()
  amount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsDateString()
  incurredAt?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class ListExpensesQueryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsIn(["createdAt:asc", "createdAt:desc"])
  sort?: "createdAt:asc" | "createdAt:desc";
}

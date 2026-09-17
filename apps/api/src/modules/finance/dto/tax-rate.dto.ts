import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";
import { IsTaxRateString } from "../../../common/validation/money";

export class CreateTaxRateDto {
  @IsString()
  @MaxLength(20)
  hsnSacCode!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsTaxRateString()
  cgstRate!: string;

  @IsTaxRateString()
  sgstRate!: string;

  @IsTaxRateString()
  igstRate!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class UpdateTaxRateDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsTaxRateString()
  cgstRate?: string;

  @IsOptional()
  @IsTaxRateString()
  sgstRate?: string;

  @IsOptional()
  @IsTaxRateString()
  igstRate?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class ListTaxRatesQueryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsIn(["createdAt:asc", "createdAt:desc"])
  sort?: "createdAt:asc" | "createdAt:desc";
}

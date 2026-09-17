import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { Transform } from "class-transformer";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";

export class CreateCompanyDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gstin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  billingAddress?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gstin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  billingAddress?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
}

/** Document 5 §5.1: "Filters: tag, q, archived." */
export class ListCompaniesQueryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === "true" || value === true)
  @IsBoolean()
  archived?: boolean;
}

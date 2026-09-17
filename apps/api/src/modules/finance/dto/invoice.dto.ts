import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { InvoiceStatus } from "@prisma/client";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";
import { IsMoneyString, IsQuantityString } from "../../../common/validation/money";

export class CreateInvoiceDto {
  @IsUUID()
  companyId!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class CreateInvoiceFromProposalDto {
  @IsUUID()
  proposalId!: string;
}

/** PATCH — Document 5 §8.1: "Only DRAFT; send version for optimistic lock." */
export class UpdateInvoiceDto {
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsInt()
  @Min(1)
  version!: number;
}

export class InvoiceLineItemDto {
  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsString()
  @MaxLength(20)
  hsnSacCode!: string;

  @IsQuantityString()
  quantity!: string;

  @IsMoneyString()
  unitPrice!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/** `PUT /invoices/:id/line-items` — Document 5 §8.1: "Only DRAFT." */
export class ReplaceInvoiceLineItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  lines!: InvoiceLineItemDto[];
}

export class CancelInvoiceDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;
}

export class ListInvoicesQueryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsIn(["createdAt:asc", "createdAt:desc"])
  sort?: "createdAt:asc" | "createdAt:desc";
}

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ProposalStatus } from "@prisma/client";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";
import { IsMoneyString, IsQuantityString } from "../../../common/validation/money";

export class CreateProposalDto {
  @IsUUID()
  dealId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  terms?: string;
}

/** PATCH — Document 5 §6.1: "only if status=DRAFT." Only `terms` is mutable this way. */
export class UpdateProposalDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  terms?: string;
}

export class ProposalLineItemDto {
  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsQuantityString()
  quantity!: string;

  @IsMoneyString()
  unitPrice!: string;

  @IsOptional()
  @IsUUID()
  taxRateId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/** `PUT /proposals/:id/line-items` — Document 5 §6.1: "replace line items — only if DRAFT." */
export class ReplaceLineItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ProposalLineItemDto)
  lines!: ProposalLineItemDto[];
}

/**
 * `POST /proposals/:id/transition` — Document 5 §6.1/§19: internal targets
 * are exactly VIEWED/REJECTED/EXPIRED (ACCEPTED is portal-only — see
 * proposal-state-machine.ts). `ACCEPTED`/`DRAFT`/`SENT` are still listed
 * in `@IsEnum` so an attempt to send them gets a clear, specific service-
 * level rejection rather than a generic DTO validation failure — the same
 * reasoning as B2's Deal `lostReason` fix (business-rule enforcement
 * belongs in the service, DTO validation is for shape only).
 */
export class TransitionProposalDto {
  @IsEnum(ProposalStatus)
  to!: ProposalStatus;
}

/** Document 5 §2.5: `?sort=createdAt:desc`, whitelist per resource. */
export class ListProposalsQueryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsIn(["createdAt:asc", "createdAt:desc"])
  sort?: "createdAt:asc" | "createdAt:desc";
}

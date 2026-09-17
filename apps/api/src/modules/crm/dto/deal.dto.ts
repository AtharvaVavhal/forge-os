import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { DealLostReason, DealStage, LeadSource } from "@prisma/client";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";
import { IsMoneyString } from "../../../common/validation/money";

export class CreateDealDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsMoneyString()
  estimatedValue!: string;

  /** Defaults to the acting user if omitted (Deal.owner_id is required). */
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

/** PATCH — mutable fields only; **never** `stage` (Document 5 §5.4). */
export class UpdateDealDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsMoneyString()
  estimatedValue?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;
}

/** Document 5 §5.4: `{ "to": "WON", "lostReason": "PRICE" }`. */
export class TransitionDealDto {
  @IsEnum(DealStage)
  to!: DealStage;

  /**
   * Required when `to === "LOST"` (Document 5 §12.2) — enforced in
   * `DealsService.transition`, not here with `@ValidateIf`, so the
   * response is the specific `DEAL_LOST_REASON_REQUIRED` business-rule
   * error rather than class-validator's generic validation-failure shape
   * (the same reasoning as the WON-precondition check, which is also a
   * service-level business rule, not a DTO shape rule).
   */
  @IsOptional()
  @IsEnum(DealLostReason)
  lostReason?: DealLostReason;
}

export class ReopenDealDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsMoneyString()
  estimatedValue?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

export class BulkReassignDealsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  ids!: string[];

  @IsUUID()
  ownerId!: string;
}

/** Document 5 §5.4: "Filters: stage, ownerId, source (via lead), date range, q." */
export class ListDealsQueryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsEnum(DealStage)
  stage?: DealStage;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;
}

import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { LeadSource, LeadStatus } from "@prisma/client";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";
import { IsMoneyString } from "../../../common/validation/money";

export class CreateLeadDto {
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

/** PATCH — "non-terminal fields" only (Document 5 §5.3); `status` is never here. */
export class UpdateLeadDto {
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class TransitionLeadDto {
  @IsEnum(LeadStatus)
  to!: LeadStatus;
}

/**
 * Document 5 §19: "POST /leads/:id/convert | deal fields | {lead,deal} |
 * create deal." Company/contact context is inherited from the Lead itself
 * (§5.3: "carry company/contact context") — the client supplies only the
 * fields a Deal needs that a Lead doesn't already have, and never a
 * `dealId` (the server creates the Deal; the client cannot fabricate the
 * target).
 */
export class ConvertLeadDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsMoneyString()
  estimatedValue!: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

/** Document 5 §5.3: "Filters: status, source, q." */
export class ListLeadsQueryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

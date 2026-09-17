import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { CursorPaginationQueryDto } from "../../../common/pagination/cursor-pagination";

/**
 * B2 CRM scope only exposes company/contact/deal as Activity parents —
 * `projectId` is deliberately never accepted here (Projects is B4, not
 * implemented; there is no way to validate a `projectId` belongs to the
 * caller's org yet). The DB CHECK constraint still permits it; this DTO
 * simply never sends it. Validation that *exactly one* of the three is
 * present lives in ActivitiesService (matches the CHECK constraint's
 * "exactly one of company/contact/deal/project" invariant for the subset
 * this phase can populate).
 */
export class CreateActivityDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  dealId?: string;

  @IsString()
  @MaxLength(100)
  type!: string;

  @IsString()
  @MaxLength(2000)
  summary!: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  /**
   * Document 5 §5.5: "Follow-up:... included in POST /activities payload
   * optional nextFollowUpAt when parent is Deal (single UX action)." Only
   * valid when `dealId` is the parent — validated in the service, not
   * here, since it's a cross-field rule.
   */
  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;
}

export class ListActivitiesQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  dealId?: string;
}

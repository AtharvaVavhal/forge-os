import { Equals, IsEnum, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ForgeFundEntryType } from "@prisma/client";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";
import { IsMoneyString } from "../../../common/validation/money";

/**
 * Document 5 §8.4's example body explicitly includes `sourceType: null,
 * sourceId: null` on a manual entry (and the existing frontend sends
 * exactly that — see apps/web/src/features/finance/api/finance-api.ts).
 * These two fields are whitelisted here *only* so that explicit `null`
 * passes `forbidNonWhitelisted` — `@Equals(null)` rejects any actual
 * string value, so a client can never set a source this way. Automatic,
 * source-linked entries are created only by the webhook handler
 * (RazorpayService), never through this public DTO.
 */
export class CreateForgeFundEntryDto {
  @IsEnum(ForgeFundEntryType)
  type!: ForgeFundEntryType;

  /**
   * Always a positive magnitude from the client — Document 2's stored-
   * value sign convention ("positive for CONTRIBUTION, negative for
   * WITHDRAWAL/ALLOCATION") is applied server-side based on `type`, not
   * typed in by the caller (the existing frontend's own form validation
   * only ever accepts a plain positive decimal string — no minus sign).
   */
  @IsMoneyString()
  amount!: string;

  @IsString()
  @MaxLength(2000)
  reason!: string;

  @IsOptional()
  @Equals(null)
  sourceType?: null;

  @IsOptional()
  @Equals(null)
  sourceId?: null;
}

export class ListForgeFundEntriesQueryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsIn(["createdAt:asc", "createdAt:desc"])
  sort?: "createdAt:asc" | "createdAt:desc";
}

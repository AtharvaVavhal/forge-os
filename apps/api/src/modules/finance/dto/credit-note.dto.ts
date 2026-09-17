import { IsEnum, IsIn, IsOptional, IsUUID } from "class-validator";
import { CreditNoteReason } from "@prisma/client";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";
import { IsMoneyString } from "../../../common/validation/money";

/** Document 5 §8.3: "lines optional" — this phase implements the documented, line-less create shape (matches the existing frontend contract exactly; see docs/IMPLEMENTATION-PHASE-B5.md). */
export class CreateCreditNoteDto {
  @IsUUID()
  invoiceId!: string;

  @IsEnum(CreditNoteReason)
  reason!: CreditNoteReason;

  /** Document 2: "may be 0 for pure-documentation corrections with no money movement" — `IsMoneyString` already allows "0.00". */
  @IsMoneyString()
  amount!: string;
}

export class ListCreditNotesQueryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsIn(["createdAt:asc", "createdAt:desc"])
  sort?: "createdAt:asc" | "createdAt:desc";
}

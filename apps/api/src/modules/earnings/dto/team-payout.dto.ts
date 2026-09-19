import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import { TeamPayoutStatus } from "@prisma/client";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";
import { IsMoneyString } from "../../../common/validation/money";

export class CreateTeamPayoutRequestDto {
  @IsMoneyString()
  amount!: string;
}

/** `review`/`approve`/`process`/`mark-failed` are version-guarded (not `@Idempotent()` — see team-payouts.controller.ts). */
export class ReviewTeamPayoutDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class ApproveTeamPayoutDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class RejectTeamPayoutDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ProcessTeamPayoutDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  processor?: string;
}

/** No `version` — this route is `@Idempotent()`-guarded, and a duplicate mark-paid on an already-PAID request returns 200 unchanged regardless of version. */
export class MarkPaidTeamPayoutDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  externalReference!: string;
}

export class MarkFailedTeamPayoutDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ListPayoutsQueryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsEnum(TeamPayoutStatus)
  status?: TeamPayoutStatus;
}

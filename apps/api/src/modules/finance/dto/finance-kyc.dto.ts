import { KycStatus } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";

export enum FinanceKycReviewAction {
  APPROVE = "APPROVE",
  REJECT = "REJECT",
}

/** List query — defaults prioritize UNDER_REVIEW. */
export class ListFinanceKycQueryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsEnum(KycStatus)
  status?: KycStatus;
}

export class ReviewFinanceKycDto {
  @IsEnum(FinanceKycReviewAction)
  action!: FinanceKycReviewAction;

  @ValidateIf((o: ReviewFinanceKycDto) => o.action === FinanceKycReviewAction.REJECT)
  @IsString()
  @IsNotEmpty({ message: "rejectionReason is required when rejecting KYC." })
  @MinLength(3, { message: "rejectionReason must be at least 3 characters." })
  @MaxLength(2000)
  rejectionReason?: string;
}

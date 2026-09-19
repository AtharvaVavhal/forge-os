import { applyDecorators } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { ProjectAllocationStatus } from "@prisma/client";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";

/**
 * A normal round's lines must be positive (structurally, via the money
 * regex having no leading "-"); an adjustment round's lines may be signed
 * (positive = additional pay, negative = clawback) — the service layer, not
 * the DTO, enforces which sign is allowed for a given round, since that
 * depends on `adjustment_of_id`, not on the shape of the input alone.
 */
export const SIGNED_MONEY_REGEX = /^-?\d{1,10}\.\d{2}$/;

function IsSignedMoneyString(): PropertyDecorator {
  return applyDecorators(
    Matches(SIGNED_MONEY_REGEX, {
      message: 'must be a decimal string with exactly two decimal places, e.g. "3300.00" or "-500.00"',
    })
  );
}

export class ProjectAllocationLineInputDto {
  @IsUUID()
  userId!: string;

  @IsSignedMoneyString()
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateProjectAllocationDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ProjectAllocationLineInputDto)
  lines?: ProjectAllocationLineInputDto[];
}

export class ReplaceProjectAllocationLinesDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ProjectAllocationLineInputDto)
  lines!: ProjectAllocationLineInputDto[];
}

export class ApproveProjectAllocationDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class CancelProjectAllocationDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class ListProjectAllocationsQueryDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(ProjectAllocationStatus)
  status?: ProjectAllocationStatus;
}

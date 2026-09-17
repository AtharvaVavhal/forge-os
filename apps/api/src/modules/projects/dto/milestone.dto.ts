import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { MilestoneStatus } from "@prisma/client";

export class CreateMilestoneDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsBoolean()
  @IsOptional()
  requiresClientApproval?: boolean;

  @IsISO8601()
  @IsOptional()
  dueDate?: string;

  @IsInt()
  @Type(() => Number)
  @IsOptional()
  sortOrder?: number;
}

export class TransitionMilestoneDto {
  @IsEnum(MilestoneStatus)
  to!: MilestoneStatus;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  reason?: string;
}

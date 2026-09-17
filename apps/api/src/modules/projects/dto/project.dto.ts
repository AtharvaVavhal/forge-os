import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { ProjectPhase, ProjectStatus } from "@prisma/client";

export class HandoverItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  item!: string;

  @IsBoolean()
  done!: boolean;

  @IsISO8601()
  @IsOptional()
  doneAt?: string | null;

  @IsUUID()
  @IsOptional()
  doneBy?: string | null;
}

export class UpdateHandoverChecklistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HandoverItemDto)
  items!: HandoverItemDto[];
}

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsUUID()
  @IsNotEmpty()
  companyId!: string;

  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @IsUUID()
  @IsOptional()
  dealId?: string;

  @IsISO8601()
  @IsOptional()
  deadline?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HandoverItemDto)
  @IsOptional()
  handoverChecklist?: HandoverItemDto[];
}

export class UpdateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @IsISO8601()
  @IsOptional()
  deadline?: string;

  @IsUUID()
  @IsOptional()
  ownerId?: string;
}

export class TransitionProjectStatusDto {
  @IsEnum(ProjectStatus)
  to!: ProjectStatus;
}

export class TransitionProjectPhaseDto {
  @IsEnum(ProjectPhase)
  to!: ProjectPhase;

  @IsBoolean()
  @IsOptional()
  override?: boolean;

  @IsString()
  @IsOptional()
  overrideReason?: string;
}

export class ListProjectsQueryDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  pageSize?: number;

  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus;

  @IsEnum(ProjectPhase)
  @IsOptional()
  phase?: ProjectPhase;

  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @IsUUID()
  @IsOptional()
  companyId?: string;

  @IsString()
  @IsOptional()
  q?: string;
}

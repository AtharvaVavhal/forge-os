import { Type } from "class-transformer";
import {
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
} from "class-validator";
import { TaskPriority, TaskStatus } from "@prisma/client";

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @IsUUID()
  @IsOptional()
  milestoneId?: string;

  @IsUUID()
  @IsOptional()
  assigneeId?: string;

  @IsISO8601()
  @IsOptional()
  dueDate?: string;

  @IsUUID()
  @IsOptional()
  blockedByTaskId?: string;
}

export class UpdateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsOptional()
  title?: string;

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @IsISO8601()
  @IsOptional()
  dueDate?: string;

  @IsUUID()
  @IsOptional()
  milestoneId?: string | null;

  @IsUUID()
  @IsOptional()
  blockedByTaskId?: string | null;
}

export class TransitionTaskDto {
  @IsEnum(TaskStatus)
  to!: TaskStatus;
}

export class AssignTaskDto {
  @IsUUID()
  @IsNotEmpty()
  assigneeId!: string;
}

export class ListTasksQueryDto {
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

  @IsUUID()
  @IsOptional()
  milestoneId?: string;

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsUUID()
  @IsOptional()
  assigneeId?: string;

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;
}

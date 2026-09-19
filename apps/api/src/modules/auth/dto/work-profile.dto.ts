import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from "class-validator";

const MAX_SKILLS = 20;
const MAX_SKILL_LENGTH = 40;

export class UpsertWorkProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  primaryArea?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SKILLS)
  @IsString({ each: true })
  @MaxLength(MAX_SKILL_LENGTH, { each: true })
  skills?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;
}

import { Type } from "class-transformer";
import { IsInt, IsISO8601, Min } from "class-validator";

export class CreateTimeEntryDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  minutes!: number;

  @IsISO8601()
  loggedAt!: string;
}

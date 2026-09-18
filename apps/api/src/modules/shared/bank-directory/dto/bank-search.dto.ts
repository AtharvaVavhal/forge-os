import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class BankSearchQueryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: "q must be at least 2 characters." })
  @MaxLength(100)
  q!: string;
}

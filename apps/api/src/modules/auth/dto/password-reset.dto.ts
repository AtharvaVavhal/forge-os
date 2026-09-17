import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class RequestPasswordResetDto {
  @IsEmail()
  email!: string;
}

export class ConfirmPasswordResetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  token!: string;

  @IsString()
  @MinLength(12, { message: "Password must be at least 12 characters." })
  @MaxLength(128)
  password!: string;
}

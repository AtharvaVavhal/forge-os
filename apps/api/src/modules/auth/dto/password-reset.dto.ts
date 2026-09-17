import { IsEmail, IsString, MinLength } from "class-validator";

export class RequestPasswordResetDto {
  @IsEmail()
  email!: string;
}

export class ConfirmPasswordResetDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(12, { message: "Password must be at least 12 characters." })
  password!: string;
}

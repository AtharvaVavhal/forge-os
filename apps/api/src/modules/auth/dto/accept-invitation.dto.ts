import { IsOptional, IsString, MinLength } from "class-validator";

export class AcceptInvitationDto {
  @IsString()
  @MinLength(1)
  token!: string;

  /** TEAM-scope acceptance may set a password (Document 2: "password_hash
   * nullable if SSO-only"); CLIENT-scope acceptance likewise may set one
   * (Document 2: "password_hash nullable, magic-link supported"). Optional
   * either way — an SSO-only or magic-link-only account never sets one. */
  @IsOptional()
  @IsString()
  @MinLength(12, { message: "Password must be at least 12 characters." })
  password?: string;
}

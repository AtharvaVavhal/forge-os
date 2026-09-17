import { IsEmail, IsEnum, IsOptional, IsUUID, ValidateIf } from "class-validator";
import { InvitationScope, UserRole } from "@prisma/client";

export class CreateInvitationDto {
  @IsEnum(InvitationScope)
  scope!: InvitationScope;

  @IsEmail()
  email!: string;

  /** Required when scope=TEAM (Document 2: "TEAM sets user_role"). */
  @ValidateIf((dto: CreateInvitationDto) => dto.scope === InvitationScope.TEAM)
  @IsEnum(UserRole)
  userRole?: UserRole;

  /** Required when scope=CLIENT (Document 2: "CLIENT sets company_id"). */
  @ValidateIf((dto: CreateInvitationDto) => dto.scope === InvitationScope.CLIENT)
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  __unused?: never;
}

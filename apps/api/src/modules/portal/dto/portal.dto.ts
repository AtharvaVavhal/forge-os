import { IsEmail, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";

export class PortalLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class PortalListQueryDto extends OffsetPaginationQueryDto {}

export class CreatePortalSupportTicketDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  subject!: string;
}

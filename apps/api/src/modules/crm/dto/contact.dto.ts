import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { Transform } from "class-transformer";
import { CursorPaginationQueryDto } from "../../../common/pagination/cursor-pagination";

export class CreateContactDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

/**
 * Document 5 §5.2 lists no explicit `Filters:` line for Contacts (unlike
 * Companies/Leads/Deals). `companyId` is added here as the minimum filter
 * needed to satisfy the "company relationship" requirement (viewing a
 * company's contact list) — it is an indexed FK (`@@index([company_id])`),
 * so it stays within §2.5's "indexed columns only" rule even though the
 * spec doesn't spell it out for this resource. `q`/`archived` mirror the
 * pattern used for the other three CRM resources for consistency.
 */
export class ListContactsQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === "true" || value === true)
  @IsBoolean()
  archived?: boolean;
}

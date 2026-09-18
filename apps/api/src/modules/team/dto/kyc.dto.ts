import { KycDocumentType, KycGovernmentIdType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { MAX_FILE_SIZE_BYTES } from "../../shared/documents/services/storage.service";

/**
 * Indian PAN format (AAAAA9999A). Stored uppercase; validation is case-insensitive.
 * Format-only — no external PAN verification in this phase.
 */
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;

export class CreateKycProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  mobile?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Matches(PAN_PATTERN, { message: "pan must be a valid PAN format (AAAAA9999A)." })
  pan?: string;

  @IsOptional()
  @IsEnum(KycGovernmentIdType)
  governmentIdType?: KycGovernmentIdType;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  governmentIdNumber?: string;
}

export class UpdateKycProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  mobile?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Matches(PAN_PATTERN, { message: "pan must be a valid PAN format (AAAAA9999A)." })
  pan?: string;

  @IsOptional()
  @IsEnum(KycGovernmentIdType)
  governmentIdType?: KycGovernmentIdType;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  governmentIdNumber?: string;
}

/** Presign a KYC document upload — profile is always the caller's own. */
export class PresignKycDocumentDto {
  @IsEnum(KycDocumentType)
  documentType!: KycDocumentType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  filename!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_FILE_SIZE_BYTES)
  sizeBytes!: number;
}

/** Register a completed R2 upload as a KycDocument row. */
export class RegisterKycDocumentDto {
  @IsEnum(KycDocumentType)
  documentType!: KycDocumentType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  filename!: string;

  /** Server-issued key from presign — never client-invented. */
  @IsString()
  @IsNotEmpty()
  storageKey!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_FILE_SIZE_BYTES)
  sizeBytes!: number;
}

import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsInt,
  Min,
  Max,
  IsIn,
} from "class-validator";
import { Type } from "class-transformer";

/** Indian IFSC: 4 letters + 0 + 6 alphanumeric. Format-only — no bank lookup. */
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

/** Common UPI VPA shape (local@handle). Format-only. */
const UPI_PATTERN = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

export const UPI_QR_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/**
 * Upsert body for own payout profile.
 * FINAL requirement: Bank Transfer AND UPI fields are both required.
 * UPI QR is registered via dedicated upload endpoints (not this body).
 */
export class UpsertPayoutProfileDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  accountHolderName!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  bankName!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(40)
  accountNumber!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(IFSC_PATTERN, { message: "ifsc must be a valid IFSC format." })
  ifsc!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(UPI_PATTERN, { message: "upiId must be a valid UPI VPA (e.g. name@bank)." })
  @MaxLength(320)
  upiId!: string;
}

export class PresignUpiQrDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  filename!: string;

  @IsString()
  @IsIn([...UPI_QR_ALLOWED_MIME_TYPES], {
    message: "UPI QR must be JPEG, PNG, or WebP.",
  })
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024)
  sizeBytes!: number;
}

export class RegisterUpiQrDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  filename!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  storageKey!: string;

  @IsString()
  @IsIn([...UPI_QR_ALLOWED_MIME_TYPES], {
    message: "UPI QR must be JPEG, PNG, or WebP.",
  })
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024)
  sizeBytes!: number;
}

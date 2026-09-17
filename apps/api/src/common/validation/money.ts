import { Matches } from "class-validator";
import { applyDecorators } from "@nestjs/common";

/**
 * Document 5 §2.6: "Money: decimal strings matching Decimal(12,2) (reject
 * float JSON numbers for money fields in DTOs — accept string
 * '12000.00')." `Decimal(12,2)` = 12 total digits, 2 after the point, so
 * up to 10 digits before it.
 */
export const MONEY_REGEX = /^\d{1,10}\.\d{2}$/;

export function IsMoneyString(): PropertyDecorator {
  return applyDecorators(
    Matches(MONEY_REGEX, {
      message: "must be a decimal string with exactly two decimal places, e.g. \"12000.00\"",
    })
  );
}

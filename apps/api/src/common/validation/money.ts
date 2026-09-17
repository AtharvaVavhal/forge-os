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

/**
 * `ProposalLineItem.quantity` is `Decimal(10, 2)` — a narrower precision
 * than the `Decimal(12,2)` money fields (8 integer digits, not 10) — so it
 * gets its own regex rather than reusing `MONEY_REGEX`.
 */
export const QUANTITY_REGEX = /^\d{1,8}\.\d{2}$/;

export function IsQuantityString(): PropertyDecorator {
  return applyDecorators(
    Matches(QUANTITY_REGEX, {
      message: "must be a decimal string with exactly two decimal places, e.g. \"1.00\"",
    })
  );
}

/**
 * `TaxRate.cgst_rate`/`sgst_rate`/`igst_rate` and `InvoiceLineItem`'s copies
 * of them are `Decimal(5, 2)` — a percentage, up to 3 integer digits (0-999,
 * comfortably covers real GST slabs which top out at 28) plus 2 decimals.
 */
export const TAX_RATE_REGEX = /^\d{1,3}\.\d{2}$/;

export function IsTaxRateString(): PropertyDecorator {
  return applyDecorators(
    Matches(TAX_RATE_REGEX, {
      message: "must be a decimal string with exactly two decimal places, e.g. \"9.00\"",
    })
  );
}

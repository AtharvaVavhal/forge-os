import { Prisma } from "@prisma/client";

/**
 * Deep snake_case -> camelCase key transform for outgoing response bodies.
 *
 * The Prisma schema's model fields are themselves snake_case (matching
 * column names exactly — no `@map` renaming), so every service in this
 * codebase that returns a Prisma row directly (the CRM module's pattern)
 * would otherwise leak `archived_at`/`organization_id`/`estimated_value`
 * onto the wire. `AuthService` (Phase 1) avoided this by hand-mapping
 * every field to a camelCase view type — consistent, but it doesn't scale
 * to five more resources' worth of hand-written mappers. This applies the
 * same camelCase convention uniformly, as a global response interceptor,
 * so every current and future controller gets it for free.
 *
 * Deliberately treats `Date` and any other non-plain object as an opaque
 * leaf value (returned as-is) rather than recursing into it. `Prisma.Decimal`
 * gets its own explicit handling rather than being left opaque — see below.
 * Only plain object literals and arrays are walked.
 */
export function toCamelCase<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((item) => toCamelCase(item)) as T;
  }
  if (value instanceof Prisma.Decimal) {
    return formatDecimal(value) as T;
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[snakeToCamel(key)] = toCamelCase(val);
    }
    return result as T;
  }
  return value as T;
}

/**
 * Every `Decimal` column in the frozen schema is scale 2 (`Decimal(5,2)`,
 * `Decimal(10,2)`, `Decimal(12,2)` — verified against every `@db.Decimal(...)`
 * declaration in prisma/schema.prisma, none use a different scale), so a
 * fixed 2-place format is safe schema-wide, not a guess for this one field.
 *
 * This matters because `Prisma.Decimal` (decimal.js under the hood)
 * defaults `.toString()`/`.toJSON()` to its *significant* digits, silently
 * dropping trailing zeros — a value stored and read back from Postgres as
 * exactly `"2.50"` would otherwise serialize onto the wire as `"2.5"`,
 * breaking Document 5 §2.6's "decimal strings matching Decimal(12,2)"
 * contract (and, on a whole-number value like `"15000.00"`, would drop
 * the fraction entirely, `"15000"` — indistinguishable from an integer).
 * Found via a real e2e test assertion on a line item's `quantity`
 * (`"2.50"` came back as `"2.5"`), not a hypothetical.
 */
function formatDecimal(value: InstanceType<typeof Prisma.Decimal>): string {
  return value.toFixed(2);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && value.constructor === Object;
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

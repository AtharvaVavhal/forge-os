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
 * Deliberately treats `Date`, Prisma `Decimal`, and any other non-plain
 * object as an opaque leaf value (returned as-is) rather than recursing
 * into it — recursing into a `Decimal` instance's internal fields (`s`,
 * `e`, `d`) would corrupt it. Only plain object literals and arrays are
 * walked.
 */
export function toCamelCase<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((item) => toCamelCase(item)) as T;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && value.constructor === Object;
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

import { BadRequestException } from "@nestjs/common";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { CursorPaginationMeta } from "./offset-pagination";

/**
 * Cursor pagination (Document 5 §2.4) — used by the "high-growth" table
 * class: Activity, Task, Document, Contact, Note, AuditLog, DomainEvent,
 * WebhookEvent. `limit` defaults to 25, caps at 100.
 *
 * The cursor is an opaque, base64-encoded `(created_at, id)` pair — a
 * stable, deterministic sort key (`created_at DESC, id DESC` as tie-break,
 * since `created_at` alone is not unique enough to guarantee a stable
 * ordering across pages). Callers must never construct or decode a cursor
 * themselves; it is only ever round-tripped through `nextCursor` in a
 * prior response.
 */
export class CursorPaginationQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}

interface DecodedCursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(row: { id: string; created_at: Date }): string {
  return Buffer.from(`${row.created_at.toISOString()}|${row.id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): DecodedCursor {
  let raw: string;
  try {
    raw = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new BadRequestException({ code: "INVALID_CURSOR", message: "The pagination cursor is invalid." });
  }
  const [isoDate, id] = raw.split("|");
  const createdAt = isoDate ? new Date(isoDate) : undefined;
  if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) {
    throw new BadRequestException({ code: "INVALID_CURSOR", message: "The pagination cursor is invalid." });
  }
  return { createdAt, id };
}

/**
 * A Prisma `OR` fragment implementing `(created_at, id) < (cursor.created_at,
 * cursor.id)` for a `created_at DESC, id DESC` sort — Prisma has no native
 * row-value comparison, so this is the standard two-branch equivalent.
 */
export function cursorWhere(cursor: string | undefined): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  const decoded = decodeCursor(cursor);
  return {
    OR: [
      { created_at: { lt: decoded.createdAt } },
      { created_at: decoded.createdAt, id: { lt: decoded.id } },
    ],
  };
}

export function buildCursorMeta(limit: number, nextCursor: string | null): CursorPaginationMeta {
  return { mode: "cursor", limit, nextCursor };
}

/**
 * Fetches `limit + 1` rows upstream, then trims back to `limit` and derives
 * `nextCursor` from whether that extra row existed — the standard
 * "over-fetch by one" technique to know if another page exists without a
 * separate COUNT query.
 */
export function paginateCursorResult<T extends { id: string; created_at: Date }>(
  rows: T[],
  limit: number
): { data: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return { data, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

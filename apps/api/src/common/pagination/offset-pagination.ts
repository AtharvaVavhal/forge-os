import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";

/**
 * Offset pagination (Document 5 §2.4) — used by the "small" table class:
 * Company, Deal, Project, Proposal, Invoice, Lead. `page` is 1-based,
 * `pageSize` defaults to 25 and caps at 100 (Document 5's own stated max).
 */
export class OffsetPaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 25;
}

export interface OffsetPaginationMeta {
  mode: "offset";
  page: number;
  pageSize: number;
  total: number;
}

export function offsetSkipTake(page = 1, pageSize = 25): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function buildOffsetMeta(page: number, pageSize: number, total: number): OffsetPaginationMeta {
  return { mode: "offset", page, pageSize, total };
}

/** Frozen list-response envelope (Document 5 §2.4). */
export interface ListEnvelope<T> {
  data: T[];
  meta: { pagination: OffsetPaginationMeta | CursorPaginationMeta };
}

export interface CursorPaginationMeta {
  mode: "cursor";
  limit: number;
  nextCursor: string | null;
}

export { IsIn };

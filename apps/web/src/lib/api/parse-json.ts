export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function readField(node: Record<string, unknown>, camel: string, snake: string): unknown {
  if (camel in node) return node[camel];
  if (snake in node) return node[snake];
  return undefined;
}

export function asIsoDate(value: unknown): string | null {
  const text = asString(value);
  return text ?? null;
}

export function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return null;
}

/** Money: Document 5 requires decimal strings. Numbers are not accepted. */
export function asMoneyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) return null;
  return value;
}

export function unwrapData(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  if ("data" in payload) return payload.data;
  return payload;
}

export interface OffsetPage {
  mode: "offset";
  page: number;
  pageSize: number;
  total: number | null;
}

export interface CursorPage {
  mode: "cursor";
  limit: number;
  nextCursor: string | null;
}

export type ParsedPagination = OffsetPage | CursorPage;

export function parseListEnvelope<T>(
  payload: unknown,
  parseItem: (value: unknown) => T | null
): { items: T[]; pagination: ParsedPagination } | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return null;
  const items = payload.data.map(parseItem).filter((item): item is T => item !== null);
  const meta = isRecord(payload.meta) ? payload.meta : null;
  const paginationNode = meta && isRecord(meta.pagination) ? meta.pagination : null;
  return { items, pagination: parsePagination(paginationNode, items.length) };
}

function parsePagination(node: Record<string, unknown> | null, fallbackCount: number): ParsedPagination {
  const mode = asString(node?.mode);
  if (mode === "cursor") {
    return {
      mode: "cursor",
      limit: typeof node?.limit === "number" ? node.limit : fallbackCount,
      nextCursor: asString(node?.nextCursor) ?? asString(node?.next_cursor) ?? null,
    };
  }
  return {
    mode: "offset",
    page: typeof node?.page === "number" ? node.page : 1,
    pageSize: typeof node?.pageSize === "number" ? node.pageSize : typeof node?.page_size === "number" ? node.page_size : 25,
    total: typeof node?.total === "number" ? node.total : null,
  };
}

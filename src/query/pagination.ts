// Contracts mirroring the Tempest FastAPI SDK pagination envelopes, so a
// React frontend consumes them with no manual mapping.
//
// Offset (fastapi-pagination `Page` / BasePaginationSchema):
//   { items, total, page, size, pages }   (some configs name the size `page_size`)
// Cursor (CursorPaginationSchema):
//   { items, next_cursor, has_more, limit }

/** Offset-paginated response envelope (fastapi-pagination `Page[T]`). */
export interface OffsetPage<T> {
    /** The rows for the current page. */
    items: T[];
    /** Total number of matching rows across all pages. */
    total: number;
    /** Current 1-based page number. */
    page: number;
    /** Total number of pages. */
    pages: number;
    /** Page size — fastapi-pagination emits `size`. */
    size?: number;
    /** Page size — some backends name it `page_size` instead. */
    page_size?: number;
}

/** Cursor-paginated response envelope (`CursorPaginationSchema[T]`). */
export interface CursorPage<T> {
    /** The rows for this batch. */
    items: T[];
    /** Opaque cursor for the next batch, or null when exhausted. Pass it back verbatim. */
    next_cursor: string | null;
    /** Whether another batch exists. */
    has_more: boolean;
    /** Batch size used for this query. */
    limit: number;
}

/** Offset filter query params (fastapi-pagination / `BasePaginationFilterSchema`). */
export interface OffsetParams {
    page?: number;
    /** Page size — fastapi-pagination convention. */
    size?: number;
    /** Page size — `page_size` convention. */
    page_size?: number;
    order_by?: string;
    ascending?: boolean;
}

/** Cursor filter query params (`CursorPaginationFilterSchema`). */
export interface CursorParams {
    cursor?: string | null;
    limit?: number;
    order_by?: string;
    ascending?: boolean;
}

/**
 * Type guard for an {@link OffsetPage} envelope.
 *
 * @param value - The unknown value to test.
 * @returns Whether it carries `items` + `total` + `page` + `pages`.
 */
export function isOffsetPage<T = unknown>(value: unknown): value is OffsetPage<T> {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return Array.isArray(v.items) && typeof v.total === "number" && typeof v.pages === "number";
}

/**
 * Type guard for a {@link CursorPage} envelope.
 *
 * @param value - The unknown value to test.
 * @returns Whether it carries `items` + `has_more` + a `next_cursor` key.
 */
export function isCursorPage<T = unknown>(value: unknown): value is CursorPage<T> {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return Array.isArray(v.items) && typeof v.has_more === "boolean" && "next_cursor" in v;
}

/**
 * Build an empty {@link OffsetPage} — handy as `placeholderData`/`initialData`.
 *
 * @param pageSize - The page size to report (default 20).
 * @returns An empty offset page on page 1.
 */
export function emptyOffsetPage<T>(pageSize = 20): OffsetPage<T> {
    return { items: [], total: 0, page: 1, size: pageSize, pages: 0 };
}

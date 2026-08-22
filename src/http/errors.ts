import type { ApiError } from "./types";

/**
 * Error thrown by {@link createApiClient} / {@link uploadWithProgress} on a
 * non-2xx response. Mirrors the Tempest FastAPI SDK error envelope
 * (`{ detail, code, details.request_id }`) so callers get a typed `code` and a
 * `requestId` for log correlation, while still being a real `Error` (stack
 * trace, `instanceof Error`).
 *
 * @example
 * try {
 *     await api.post("/users", { body });
 * } catch (err) {
 *     if (isApiError(err) && err.code === "EMAIL_TAKEN") {
 *         showFieldError("email", err.detail);
 *     }
 * }
 */
export class TempestApiError extends Error implements ApiError {
    readonly status: number;
    readonly detail: string;
    readonly code?: string;
    readonly requestId?: string;
    readonly fields?: Record<string, string>;
    readonly body?: unknown;

    constructor(init: ApiError) {
        super(init.detail);
        this.name = "TempestApiError";
        this.status = init.status;
        this.detail = init.detail;
        this.code = init.code;
        this.requestId = init.requestId;
        this.fields = init.fields;
        this.body = init.body;
    }
}

/**
 * Type guard for the {@link ApiError} shape. Matches both {@link TempestApiError}
 * instances and plain objects carrying `status` + `detail`.
 *
 * @param error - The unknown value (typically a caught error).
 * @returns Whether `error` conforms to the `ApiError` contract.
 */
export function isApiError(error: unknown): error is ApiError {
    return (
        typeof error === "object" &&
        error !== null &&
        typeof (error as ApiError).status === "number" &&
        typeof (error as ApiError).detail === "string"
    );
}

/**
 * Location prefixes FastAPI puts at the head of a validation error's `loc`,
 * naming the part of the request rather than the field. Dropped from the
 * rendered path, so `["body", "email"]` reads as `email`.
 */
const LOC_ROOTS: ReadonlySet<string> = new Set(["body", "query", "path", "header", "cookie"]);

/**
 * Render a FastAPI validation error's `loc` tuple as a dotted field path.
 *
 * @param loc - The raw `loc` value from one validation error entry.
 * @returns The dotted path (`"items.0.price"`), or undefined when `loc` carries
 *     nothing addressable.
 */
function formatLoc(loc: unknown): string | undefined {
    if (!Array.isArray(loc)) return undefined;
    const parts = loc
        .filter(
            (part): part is string | number => typeof part === "string" || typeof part === "number",
        )
        .filter((part, index) => !(index === 0 && LOC_ROOTS.has(String(part))));
    return parts.length > 0 ? parts.join(".") : undefined;
}

/**
 * How deep {@link normalizeDetail} follows a nested `detail` before giving up.
 *
 * A real envelope needs two or three levels: the list, an entry, the entry's
 * own `detail`. The cap exists because the body is untrusted input arriving on
 * the error path — a response nesting `{"detail":{"detail":…}}` twenty thousand
 * deep (a 220 KB body) overflowed the stack, and a `RangeError` thrown while
 * *building* the error is worse than the error: the caller's `catch` stops
 * receiving a `TempestApiError`, so `isApiError` is false, `describeApiError`
 * has nothing to read and the `401` handling never runs.
 */
const MAX_DETAIL_DEPTH = 4;

/**
 * Pull field-level messages out of a validation `detail` list.
 *
 * FastAPI's `422` body is `detail: [{ loc, msg, type }]`, which is exactly what
 * a form needs and exactly what the flattened `detail` string destroys. Only the
 * top level is read: a validation error names one field per entry, and following
 * nesting here would invent paths the backend never sent.
 *
 * @param raw - The `detail` value from the error body.
 * @returns Field path to message, or undefined when the body is not a
 *     validation list (or carries no entry naming a field).
 */
function collectFields(raw: unknown): Record<string, string> | undefined {
    if (!Array.isArray(raw)) return undefined;

    const fields: Record<string, string> = {};
    for (const entry of raw) {
        if (typeof entry !== "object" || entry === null) continue;
        const record = entry as Record<string, unknown>;
        const field = formatLoc(record.loc);
        if (field === undefined || field in fields) continue;
        const message = normalizeDetail(record.msg) ?? normalizeDetail(record.message);
        if (message === undefined) continue;
        fields[field] = message;
    }

    return Object.keys(fields).length > 0 ? fields : undefined;
}

/**
 * Collapse a backend `detail` of any shape into a single readable line.
 *
 * FastAPI answers a `422` with `detail` as a **list** of
 * `{ loc, msg, type }` entries, not a string. Passing that through `String()`
 * yields `"[object Object]"` — an error message that tells the user nothing and
 * hides which field failed. Each entry becomes `"<field>: <msg>"` and the
 * entries are joined with `"; "`; a nested object is read through its
 * `msg`/`message`/`detail` string.
 *
 * @param raw - The `detail` (or `message`) value from the error body.
 * @param depth - Current nesting level. Past {@link MAX_DETAIL_DEPTH} the value
 *     is treated as unreadable instead of followed further.
 * @returns The rendered message, or undefined when nothing readable is there —
 *     letting the caller fall back to the synthetic `Erro <status>`.
 */
function normalizeDetail(raw: unknown, depth: number = 0): string | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw === "string") return raw === "" ? undefined : raw;
    if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
    if (depth >= MAX_DETAIL_DEPTH) return undefined;

    if (Array.isArray(raw)) {
        const lines = raw
            .map((entry) => {
                const message = normalizeDetail(entry, depth + 1);
                if (message === undefined) return undefined;
                const field =
                    typeof entry === "object" && entry !== null
                        ? formatLoc((entry as Record<string, unknown>).loc)
                        : undefined;
                return field === undefined ? message : `${field}: ${message}`;
            })
            .filter((line): line is string => line !== undefined);
        return lines.length > 0 ? lines.join("; ") : undefined;
    }

    if (typeof raw === "object") {
        const entry = raw as Record<string, unknown>;
        return (
            normalizeDetail(entry.msg, depth + 1) ??
            normalizeDetail(entry.message, depth + 1) ??
            normalizeDetail(entry.detail, depth + 1)
        );
    }

    return undefined;
}

/**
 * Statuses worth a second attempt, as a set for the sub-500 cases.
 *
 * A network failure (status `0`), a request timeout, a too-early replay, and a
 * rate limit — which usually carries the `Retry-After` the backoff honours.
 * Everything else below 500 is the server refusing on purpose.
 */
const RETRIABLE_STATUSES: ReadonlySet<number> = new Set([0, 408, 425, 429]);

/**
 * Whether an HTTP status describes a condition a replay can plausibly fix.
 *
 * The single owner of that decision. It used to be spelled out in three places —
 * the client's own policy, the react-query default and the bare `retry()` helper
 * — and they had already drifted: the query default was missing `425`, so the
 * same `425 Too Early` was replayed through `createApiClient({ retry: true })`
 * and not replayed through `useQuery`. Same app, same error, two behaviours, and
 * no test caught it because each file asserted against its own copy.
 *
 * Deliberately about the status and nothing else. Whether a *non*-API error is
 * worth replaying, and whether the request's method may be replayed at all, are
 * the caller's calls: {@link createApiClient} refuses a non-idempotent method,
 * while a bare `retry()` has no method to inspect.
 *
 * @example
 * await api.get("/report", {
 *     retry: { shouldRetry: (error) => isApiError(error) && isRetriableStatus(error.status) },
 * });
 *
 * @param status - The HTTP status, where `0` means the request never landed.
 * @returns Whether a retry is worth attempting.
 */
export function isRetriableStatus(status: number): boolean {
    return RETRIABLE_STATUSES.has(status) || status >= 500;
}

/**
 * Detail text synthesised when a response body carries none.
 *
 * Exported because {@link describeApiError} has to recognise it: a detail the
 * server never sent says strictly less than the caller's own fallback, so the
 * funnel drops it. Comparing against a copied literal would silently stop
 * matching the day this sentence is reworded — no type error, no failing test.
 *
 * @param status - The HTTP status of the error.
 * @returns The synthetic detail for that status.
 */
export function syntheticDetail(status: number): string {
    return `Erro ${status}`;
}

/**
 * Parse an error body + response into the Tempest {@link ApiError} envelope.
 *
 * Reads `detail`/`message`, the programmatic `code`, and the correlation id
 * from `details.request_id` (falling back to the `X-Request-ID` header, then
 * the id the client sent).
 *
 * A `422` from FastAPI carries `detail` as a list of `{ loc, msg, type }`
 * entries, so it is flattened to `"<field>: <msg>; <field>: <msg>"` instead of
 * being stringified into `"[object Object]"`, and the same entries are indexed
 * on `fields` (`{ email: "Field required" }`) for a form to consume without
 * parsing that line back apart. The untouched body stays on `body`.
 *
 * That flattened `detail` is developer-facing: it carries the backend's field
 * paths and the validator's own wording. `describeApiError` knows not to show it
 * to a person when `fields` is set.
 *
 * @param status - HTTP status code.
 * @param body - The parsed error body (object, string, or null).
 * @param headers - The response headers (for the `X-Request-ID` fallback).
 * @param sentRequestId - The id the client sent on the request, if any.
 * @returns A fully-populated `ApiError`.
 *
 * @tempest-limits param-count — the arguments are the response as it arrives
 * (`status`, `body`, `headers`) plus the id the request was sent with, and they are
 * passed at exactly one place: the client's response path. Exported from the package
 * root, so the rewrite would be breaking for callers that build their own errors.
 */
export function buildApiError(
    status: number,
    body: unknown,
    headers?: Headers | { get(name: string): string | null },
    sentRequestId?: string,
): ApiError {
    const obj =
        typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
    const detail =
        normalizeDetail(obj?.detail) ?? normalizeDetail(obj?.message) ?? syntheticDetail(status);
    const code = typeof obj?.code === "string" ? obj.code : undefined;
    const details =
        typeof obj?.details === "object" && obj.details !== null
            ? (obj.details as Record<string, unknown>)
            : null;
    const requestId =
        (typeof details?.request_id === "string" ? details.request_id : undefined) ??
        headers?.get("X-Request-ID") ??
        sentRequestId ??
        undefined;

    return {
        status,
        detail,
        code,
        requestId: requestId ?? undefined,
        retryAfter: parseRetryAfter(headers?.get("Retry-After")),
        fields: collectFields(obj?.detail),
        body,
    };
}

/**
 * Parse a `Retry-After` header into seconds. Accepts a delta-seconds integer
 * (`"120"`) or an HTTP-date (`"Wed, 21 Oct 2015 07:28:00 GMT"`).
 *
 * @param value - The raw header value, or null.
 * @returns The delay in seconds (>= 0), or undefined when absent/unparseable.
 */
export function parseRetryAfter(value: string | null | undefined): number | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const when = Date.parse(trimmed);
    if (Number.isNaN(when)) return undefined;
    return Math.max(0, Math.round((when - Date.now()) / 1000));
}

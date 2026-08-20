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
    readonly body?: unknown;

    constructor(init: ApiError) {
        super(init.detail);
        this.name = "TempestApiError";
        this.status = init.status;
        this.detail = init.detail;
        this.code = init.code;
        this.requestId = init.requestId;
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
 * @returns The rendered message, or undefined when nothing readable is there —
 *     letting the caller fall back to the synthetic `Erro <status>`.
 */
function normalizeDetail(raw: unknown): string | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw === "string") return raw === "" ? undefined : raw;
    if (typeof raw === "number" || typeof raw === "boolean") return String(raw);

    if (Array.isArray(raw)) {
        const lines = raw
            .map((entry) => {
                const message = normalizeDetail(entry);
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
            normalizeDetail(entry.msg) ??
            normalizeDetail(entry.message) ??
            normalizeDetail(entry.detail)
        );
    }

    return undefined;
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
 * being stringified into `"[object Object]"`. The untouched list stays on
 * `body` for callers that map errors onto form fields.
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
        normalizeDetail(obj?.detail) ?? normalizeDetail(obj?.message) ?? `Erro ${status}`;
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

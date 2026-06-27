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
 * Parse an error body + response into the Tempest {@link ApiError} envelope.
 *
 * Reads `detail`/`message`, the programmatic `code`, and the correlation id
 * from `details.request_id` (falling back to the `X-Request-ID` header, then
 * the id the client sent).
 *
 * @param status - HTTP status code.
 * @param body - The parsed error body (object, string, or null).
 * @param headers - The response headers (for the `X-Request-ID` fallback).
 * @param sentRequestId - The id the client sent on the request, if any.
 * @returns A fully-populated `ApiError`.
 */
export function buildApiError(
    status: number,
    body: unknown,
    headers?: Headers | { get(name: string): string | null },
    sentRequestId?: string,
): ApiError {
    const obj =
        typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
    const detail = obj?.detail ?? obj?.message ?? `Erro ${status}`;
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
        detail: String(detail),
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

import { isDevBuild } from "../utils/dev-mode";

/**
 * Media-type fragments that name something safe to read as text, for the types
 * that do not open with `text/` — `application/xml`, `application/javascript`,
 * `application/x-www-form-urlencoded`.
 */
const TEXTUAL_TOKENS: readonly string[] = ["xml", "javascript", "ecmascript", "urlencoded", "csv"];

/** How a {@link createApiClient} response body becomes the value a caller awaited. */
export type ResponseDecoder<T> = (response: Response) => Promise<T>;

/**
 * Whether a `Content-Type` names a JSON dialect.
 *
 * Matches the suffix forms as well as the plain one, so `application/json`,
 * `application/problem+json` (RFC 9457, what a FastAPI error handler sends) and
 * `application/vnd.tempest.v2+json` all decode as JSON instead of falling
 * through to text.
 *
 * @param contentType - The raw header value, possibly with parameters.
 * @returns Whether the body should be read with `response.json()`.
 */
export function isJsonContentType(contentType: string): boolean {
    return contentType.toLowerCase().includes("json");
}

/**
 * Whether a `Content-Type` names something that survives being read as text.
 *
 * An absent header counts as textual: a backend that answers without one is
 * almost always sending text, and treating it as binary would change what
 * existing callers get back for no measured gain.
 *
 * @param contentType - The raw header value, possibly with parameters.
 * @returns Whether the body should be read with `response.text()`.
 */
export function isTextualContentType(contentType: string): boolean {
    const type = contentType.trim().toLowerCase();
    if (type === "") return true;
    if (type.startsWith("text/")) return true;
    return TEXTUAL_TOKENS.some((token) => type.includes(token));
}

/**
 * Warn, in a development build, that a binary body reached the JSON/text path.
 *
 * @param contentType - The `Content-Type` that was decoded as a `Blob`.
 */
function warnBinaryBody(contentType: string): void {
    if (!isDevBuild()) return;
    console.warn(
        `[tempest] <ApiClient> received a binary response (content-type: ${contentType}) and returned a Blob. ` +
            "Call `client.blob()` or `client.arrayBuffer()` so the type matches what arrives.",
    );
}

/**
 * Decode a response the way its `Content-Type` asks to be decoded.
 *
 * JSON is parsed, text is read as text, and **everything else comes back as a
 * `Blob`**. That last branch is the fix for a silent data defect: the client
 * used to fall back to `response.text()` for any non-JSON body, so an
 * `image/jpeg` was decoded as UTF-8 and the bytes were destroyed on the way in.
 * Measured on a bare JPEG header — `ff d8 ff e0 00 10 4a 46 49 46` — the
 * round-trip through text returns 18 bytes for the 10 that arrived, 4 of them
 * replaced by `U+FFFD`. No caller can undo that, which is why the download had
 * to leave the client entirely.
 *
 * A `204` has no body at all and resolves to `undefined`, whatever the headers
 * claim.
 *
 * @typeParam T - What the caller expects back.
 * @param response - A response already known to be successful.
 * @returns The decoded body.
 */
export async function decodeByContentType<T>(response: Response): Promise<T> {
    if (response.status === 204) {
        return undefined as T;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (isJsonContentType(contentType)) {
        return (await response.json()) as T;
    }
    if (isTextualContentType(contentType)) {
        return (await response.text()) as unknown as T;
    }

    warnBinaryBody(contentType);
    return (await response.blob()) as unknown as T;
}

import { isDevBuild } from "../utils/dev-mode";
import { isTrustedCredentialTarget, reportSuppressedCredential } from "./credential-scope";

/**
 * Default cookie the CSRF token is read from.
 *
 * Ported from `tempest-fastapi-sdk`'s `CSRF_COOKIE_NAME`
 * (`tempest_fastapi_sdk/api/middlewares/csrf.py`), which is the cookie its
 * `make_csrf_token_dependency()` sets and its `CSRFMiddleware` compares against.
 * Matching it is what lets `csrf: true` work against that backend with no
 * configuration on either side.
 */
export const DEFAULT_CSRF_COOKIE_NAME = "csrf_token";

/**
 * Default header the CSRF token is echoed in.
 *
 * Ported from `tempest-fastapi-sdk`'s `CSRF_HEADER_NAME`, the header its
 * `CSRFMiddleware` reads on every unsafe request.
 */
export const DEFAULT_CSRF_HEADER_NAME = "X-CSRF-Token";

/**
 * Where the CSRF token comes from and which header carries it.
 *
 * The default is the **double-submit cookie**: the server sets a cookie that is
 * deliberately not `HttpOnly`, the client reads it and echoes the value in a
 * header, and the server rejects a write whose header does not match the
 * cookie. A page on another site can make the browser *send* the cookie, but
 * cannot *read* it, so it cannot write the header.
 *
 * The token is read again on every request, so a server that rotates the
 * cookie is followed without any capture step: the browser's cookie jar is the
 * store. That is also why there is no "read the token from a response header"
 * mode — it would depend on `Access-Control-Expose-Headers`, and a missing
 * expose header fails silently, as a `403` on the second write.
 */
export interface CsrfOptions {
    /** Cookie to read the token from. Default {@link DEFAULT_CSRF_COOKIE_NAME}. */
    cookieName?: string;
    /** Header to send the token in. Default {@link DEFAULT_CSRF_HEADER_NAME}. */
    headerName?: string;
    /**
     * Supply the token yourself instead of reading `cookieName`.
     *
     * For the cases the cookie cannot serve: an API on another **site**, whose
     * cookie `document.cookie` cannot see, or a backend that hands the token
     * out in a response body. Called per request, like `getToken`.
     */
    getToken?: () => string | null | undefined;
}

/**
 * Methods that must not change state, and so never carry the token.
 *
 * A deny list rather than an allow list of the four write verbs: RFC 9110
 * names the safe methods, and a custom method (`PROPFIND`, a tus extension)
 * is a write until proven otherwise. Sending the token to its own origin on
 * an unexpected verb costs nothing; omitting it costs a `403`.
 */
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/** Token sources already reported empty, so a burst of writes warns once. */
const reportedMissing = new Set<string>();

/**
 * Read one cookie from `document.cookie`, or `null` when it is absent.
 *
 * Returns `null` outside a document (a worker, a test without jsdom), where
 * there is no cookie jar to read. The value is URI-decoded when it can be,
 * and returned raw when it is not valid percent-encoding.
 *
 * @param name - The cookie name.
 * @returns The value, or `null`.
 */
function readCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const prefix = `${name}=`;
    for (const part of document.cookie.split(";")) {
        const entry = part.trim();
        if (!entry.startsWith(prefix)) continue;
        const raw = entry.slice(prefix.length);
        try {
            return decodeURIComponent(raw);
        } catch {
            return raw;
        }
    }
    return null;
}

/**
 * Say once, in a development build, that CSRF is on but there is no token.
 *
 * The request still goes out, because the SDK cannot know whether this path
 * is guarded — `CSRFMiddleware` is commonly mounted with `exclude_paths`. When
 * it is guarded, the symptom is a `403 CSRF_VALIDATION_FAILED` with nothing
 * in the app's code pointing at the cause, and the three usual causes are all
 * on the server: the cookie was never issued, was issued `HttpOnly`, or was
 * issued for a domain this page cannot read.
 *
 * @param source - What was read: the cookie name, or `"getToken"`.
 */
function reportMissingToken(source: string): void {
    if (!isDevBuild() || reportedMissing.has(source)) return;
    reportedMissing.add(source);
    const where =
        source === "getToken"
            ? "csrf.getToken() returned nothing"
            : `no readable "${source}" cookie on this page`;
    console.warn(
        `[tempest-react-sdk] CSRF is enabled but ${where}, so the write went without the token. The cookie must be issued before the first write and must not be HttpOnly.`,
    );
}

/**
 * Whether a header is already present, compared case-insensitively.
 *
 * Header names are case-insensitive, but object keys are not: a caller's
 * `"x-csrf-token"` next to the SDK's `"X-CSRF-Token"` would reach `fetch` as
 * two entries and be joined into `"a, b"`, which matches neither.
 *
 * @param headers - The headers the caller already set.
 * @param name - The header to look for.
 * @returns Whether it is set.
 */
function hasHeader(headers: HeadersInit | undefined, name: string): boolean {
    if (!headers) return false;
    return new Headers(headers).has(name);
}

/** What {@link csrfHeaders} needs to decide. */
export interface CsrfHeadersInput {
    /** The HTTP method of the request. Case-insensitive. */
    method: string;
    /** The URL the request is going to. */
    url: string;
    /**
     * The origin the token belongs to, normally the API's `baseURL`. The token
     * is only sent to this origin or to one listed in `trustedOrigins`.
     */
    reference: string;
    /** The CSRF config. `undefined` or `false` turns the header off. */
    csrf: boolean | CsrfOptions | undefined;
    /** Extra origins allowed to receive the token. */
    trustedOrigins?: readonly string[];
    /** Headers the caller already set. A CSRF header among them is never replaced. */
    headers?: HeadersInit;
}

/**
 * The CSRF header a request should carry, or an empty object.
 *
 * Every request path in the SDK — `createApiClient`, `uploadWithProgress`,
 * `createResumableUpload` — asks this function, so the rules are one rule:
 *
 * - **Off unless configured.** Without `csrf`, nothing changes.
 * - **Unsafe methods only.** `GET`, `HEAD`, `OPTIONS` and `TRACE` never carry
 *   it; they must not change state, and a token in a `GET` ends up in logs
 *   and caches for nothing.
 * - **Never across an origin.** The token follows the same scope as the bearer
 *   credential ({@link isTrustedCredentialTarget}), because a URL can come off
 *   the network — a tus `Location`, a pagination link — and a CSRF token sent
 *   to a third party is a token that third party can replay. Withheld tokens
 *   are reported once per origin in a development build.
 * - **Your header wins.** A CSRF header you set by hand, in any casing, is
 *   left alone.
 * - **Independent of auth.** It is sent on `skipAuth` requests too: login and
 *   refresh are exactly the writes a cookie session exposes to forgery.
 *
 * Exported for the request you build by hand, so it follows the same rules.
 *
 * @example
 * const headers = csrfHeaders({
 *     method: "POST",
 *     url: "https://api.acme.com/orders",
 *     reference: "https://api.acme.com",
 *     csrf: true,
 * });
 * // { "X-CSRF-Token": "<value of the csrf_token cookie>" }
 *
 * @param input - The request and the CSRF config.
 * @returns A header record to spread into the request's headers.
 */
export function csrfHeaders(input: CsrfHeadersInput): Record<string, string> {
    const { method, url, reference, csrf, trustedOrigins, headers } = input;
    if (!csrf) return {};
    if (SAFE_METHODS.has(method.toUpperCase())) return {};
    const options: CsrfOptions = csrf === true ? {} : csrf;
    const headerName = options.headerName ?? DEFAULT_CSRF_HEADER_NAME;
    if (hasHeader(headers, headerName)) return {};
    if (!isTrustedCredentialTarget(url, reference, trustedOrigins)) {
        reportSuppressedCredential(url, reference, headerName);
        return {};
    }
    const cookieName = options.cookieName ?? DEFAULT_CSRF_COOKIE_NAME;
    const token = options.getToken ? options.getToken() : readCookie(cookieName);
    if (!token) {
        reportMissingToken(options.getToken ? "getToken" : cookieName);
        return {};
    }
    return { [headerName]: token };
}

/**
 * Forget which token sources were already reported empty.
 *
 * Exported for tests, which assert the once-per-source behaviour and would
 * otherwise leak state between cases.
 */
export function resetCsrfReports(): void {
    reportedMissing.clear();
}

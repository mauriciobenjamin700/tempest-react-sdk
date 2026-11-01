import { isDevBuild } from "../utils/dev-mode";

/**
 * Origins already reported by {@link reportSuppressedCredential}, so a chunked
 * upload warns once instead of once per chunk.
 */
const reported = new Set<string>();

/**
 * A base no real request resolves against, used only to tell a relative
 * reference from one that does not parse when there is no document at all.
 */
const DETACHED_BASE = "http://relative.invalid";

/**
 * The origin a credential reference names, or `null` when it has none.
 *
 * A reference — `baseURL`, `endpoint`, `credentialOrigin`, a trusted origin —
 * is the trust anchor, so a relative one resolves against the page's own
 * address (`location.href`), never against a `<base href>`: an injected
 * `<base>` must not be able to move the anchor onto its own host.
 *
 * Relative references are the shape you get behind a dev-server or a reverse
 * proxy, and they name the page's own origin. Comparing a resolved absolute
 * target against an unresolved relative reference is how the first draft of
 * this function withheld the credential from every client configured that way.
 *
 * @param url - Absolute or relative URL.
 * @returns The origin, or `null` when it cannot be resolved.
 */
function originOf(url: string): string | null {
    try {
        return new URL(url, globalThis.location?.href).origin;
    } catch {
        return null;
    }
}

/**
 * Where a request to `target` actually goes, as the transport resolves it.
 *
 * `XMLHttpRequest.open()` and `fetch()` resolve a relative URL against the
 * document's base URL (`document.baseURI`), which a `<base href>` changes and
 * `location.href` does not. Until 0.82.0 the target was resolved against the
 * page's address, so under an injected `<base>` a relative `url` and a relative
 * `credentialOrigin` compared equal while the request went to the `<base>` host
 * with the token (#530). A worker has no document; its base is its location.
 *
 * Three answers, because the caller treats them differently:
 *
 * - an origin — compare it;
 * - `"relative"` — a relative target with nothing to resolve it against
 *   (outside any browsing context): there is no origin for it to cross;
 * - `"invalid"` — a target that does not parse. Refused: the check used to
 *   fail open here, so a custom `fetcher` that accepts such a string received
 *   the credential (#530).
 *
 * An opaque origin (`data:`, `file:`) comes back as the string `"null"`, which
 * the caller also refuses: two opaque origins are never the same origin, yet
 * `"null" === "null"`.
 *
 * @param target - The URL the request is about to go to.
 * @returns The origin, `"relative"` or `"invalid"`.
 */
function targetOriginOf(target: string): string {
    const base = globalThis.document?.baseURI ?? globalThis.location?.href;
    if (base !== undefined) {
        try {
            return new URL(target, base).origin;
        } catch {
            return "invalid";
        }
    }
    try {
        return new URL(target).origin;
    } catch {
        try {
            new URL(target, DETACHED_BASE);
            return "relative";
        } catch {
            return "invalid";
        }
    }
}

/**
 * Resolve a URL the way the transport will, against the document base URL.
 *
 * Exported for the resumable upload, which has to resolve a relative tus
 * `Location` against the creation endpoint as the request actually went out.
 *
 * @param url - Absolute or relative URL.
 * @returns The absolute URL, or `null` when it does not resolve.
 */
export function resolveRequestUrl(url: string): string | null {
    try {
        return new URL(url, globalThis.document?.baseURI ?? globalThis.location?.href).href;
    } catch {
        return null;
    }
}

/**
 * Whether a request to `target` may carry the caller's credential.
 *
 * The SDK writes `Authorization: Bearer` in three places, and until 0.66.0 none
 * of them looked at where the request was going. That is only safe while every
 * target URL is written by the app: a resumable upload takes its URL from the
 * server's `Location` header, and `createApiClient` lets an absolute path
 * override `baseURL` entirely, so a URL arriving over the network could decide
 * which origin received the token — and the file bytes with it.
 *
 * Handing an upload off to object storage on another host is ordinary `tus`
 * deployment, not an attack, which is exactly why the credential must be scoped
 * rather than the request blocked: the upload still goes through, it just goes
 * without the API's bearer token.
 *
 * Both sides are resolved first, so a relative `baseURL` or `endpoint` — the
 * shape behind a dev-server or reverse proxy — compares equal to the absolute
 * URL the request actually goes to. The target resolves against the document
 * base URL, where the transport sends it; the reference against the page's
 * own address, which a `<base href>` cannot move. Outside a browsing context a
 * relative target is allowed — there is no origin for it to cross — and a
 * target that does not parse is refused rather than trusted.
 *
 * @param target - The URL the request is about to go to.
 * @param reference - The origin the credential belongs to, normally the
 *     client's `baseURL` or the upload `endpoint`.
 * @param trustedOrigins - Extra origins the app declared, for the legitimate
 *     second host: a CDN, a signed upload endpoint.
 * @returns Whether the credential may be attached.
 *
 * @example
 * isTrustedCredentialTarget("https://api.acme.com/me", "https://api.acme.com");
 * // true
 * isTrustedCredentialTarget("https://cdn.other/u/1", "https://api.acme.com");
 * // false
 */
export function isTrustedCredentialTarget(
    target: string,
    reference: string,
    trustedOrigins: readonly string[] = [],
): boolean {
    const targetOrigin = targetOriginOf(target);
    if (targetOrigin === "relative") return true;
    if (targetOrigin === "invalid" || targetOrigin === "null") return false;
    if (targetOrigin === originOf(reference)) return true;
    return trustedOrigins.some((origin) => originOf(origin) === targetOrigin);
}

/**
 * Say once, in a development build, that a credential was withheld.
 *
 * Without it the symptom is a `401` (or, for the CSRF header, a `403`) from a
 * host the developer never typed, and nothing in the app's code mentions the
 * origin that produced it. Keyed by credential and target origin, so a
 * hundred-chunk upload reports one line per header it withheld.
 *
 * Silent in production for the same reason {@link parseResponse} is: the origin
 * an app talks to is not something to print into a user's console or ship to an
 * error tracker.
 *
 * @param target - The URL whose request went out unauthenticated.
 * @param reference - The origin the credential was scoped to.
 * @param header - The header that was withheld. Default `"Authorization"`.
 */
export function reportSuppressedCredential(
    target: string,
    reference: string,
    header = "Authorization",
): void {
    if (!isDevBuild()) return;
    const targetOrigin = originOf(target);
    if (targetOrigin === null) return;
    const key = `${header} ${targetOrigin}`;
    if (reported.has(key)) return;
    reported.add(key);
    console.warn(
        `[tempest-react-sdk] ${header} was not sent to ${targetOrigin}: the credential is scoped to ${originOf(reference) ?? reference}. Add the origin to trustedOrigins if it should receive the token.`,
    );
}

/**
 * Forget which origins were already reported.
 *
 * Exported for tests, which assert the once-per-origin behaviour and would
 * otherwise leak state between cases.
 */
export function resetSuppressedCredentialReports(): void {
    reported.clear();
}

import { isDevBuild } from "../utils/dev-mode";

/**
 * Origins already reported by {@link reportSuppressedCredential}, so a chunked
 * upload warns once instead of once per chunk.
 */
const reported = new Set<string>();

/**
 * The origin a URL resolves to, or `null` when it has none to compare.
 *
 * Relative values resolve against the document, because that is what they mean
 * everywhere else in the SDK: an `endpoint` of `"/api/uploads"` and a `baseURL`
 * of `"/api"` are the shape you get behind a dev-server or a reverse proxy, and
 * both name the page's own origin. Comparing a resolved absolute target against
 * an unresolved relative reference is how the first draft of this function
 * withheld the credential from every client configured that way.
 *
 * `null` is reserved for the case with genuinely nothing to compare: a relative
 * URL outside a browsing context, where there is no document to resolve against.
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
 * Both sides are resolved against the document first, so a relative `baseURL`
 * or `endpoint` — the shape behind a dev-server or reverse proxy — compares
 * equal to the absolute URL the request actually goes to. Outside a browsing
 * context a relative target resolves to nothing and is allowed: there is no
 * origin for it to cross.
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
    const targetOrigin = originOf(target);
    if (targetOrigin === null) return true;
    if (targetOrigin === originOf(reference)) return true;
    return trustedOrigins.some((origin) => originOf(origin) === targetOrigin);
}

/**
 * Say once, in a development build, that a credential was withheld.
 *
 * Without it the symptom is a `401` from a host the developer never typed, and
 * nothing in the app's code mentions the origin that produced it. Keyed by
 * target origin so a hundred-chunk upload reports one line.
 *
 * Silent in production for the same reason {@link parseResponse} is: the origin
 * an app talks to is not something to print into a user's console or ship to an
 * error tracker.
 *
 * @param target - The URL whose request went out unauthenticated.
 * @param reference - The origin the credential was scoped to.
 */
export function reportSuppressedCredential(target: string, reference: string): void {
    if (!isDevBuild()) return;
    const targetOrigin = originOf(target);
    if (targetOrigin === null || reported.has(targetOrigin)) return;
    reported.add(targetOrigin);
    console.warn(
        `[tempest-react-sdk] Authorization was not sent to ${targetOrigin}: the credential is scoped to ${originOf(reference) ?? reference}. Add the origin to trustedOrigins if it should receive the token.`,
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

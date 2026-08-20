/**
 * Matches a path that already carries its own scheme (`https:`, `blob:`), which
 * makes it an absolute URL rather than something to resolve against the base.
 */
const ABSOLUTE_URL = /^[a-z][a-z\d+\-.]*:/i;

/** Split a path into its non-empty segments, dropping surrounding slashes. */
function segments(path: string): string[] {
    return path.split("/").filter(Boolean);
}

/**
 * Whether `path` already starts with every segment of `prefix`.
 *
 * Compared segment by segment, so a `/api` prefix is not considered present in
 * `/api-keys` — a plain `startsWith` would swallow the resource.
 *
 * @param path - Segments of the request path.
 * @param prefix - Segments of the base path.
 * @returns Whether the prefix is already applied.
 */
function startsWithSegments(path: string[], prefix: string[]): boolean {
    if (prefix.length === 0 || prefix.length > path.length) return false;
    return prefix.every((segment, index) => path[index] === segment);
}

/**
 * Resolve the origin a relative `baseURL` hangs off.
 *
 * A base such as `"/api"` is the shape you get behind a dev-server proxy or a
 * reverse proxy that serves app and API from one host. It only means something
 * in a browsing context, so this throws with the config to fix rather than
 * letting `new URL` report `Invalid base URL` from three frames deeper.
 *
 * @param baseURL - The base as the caller wrote it.
 * @returns The origin to resolve against.
 * @throws When there is no `location` to borrow an origin from.
 */
function currentOrigin(baseURL: string): string {
    const origin = globalThis.location?.origin;
    if (!origin) {
        throw new TypeError(
            `createApiClient: baseURL "${baseURL}" is relative and there is no location to resolve it against. Pass an absolute URL (https://api.example.com) outside the browser.`,
        );
    }
    return origin;
}

/** Options accepted by {@link buildApiUrl}. */
export interface BuildApiUrlOptions {
    /**
     * Path segment every request is nested under, such as `"/api"`. Joined
     * after the path the `baseURL` already carries.
     */
    prefix?: string;
    /** Query params to append. `undefined` and `null` values are skipped. */
    params?: Record<string, string | number | boolean | undefined | null>;
}

/**
 * Join a base URL, an optional prefix and a request path into an absolute URL.
 *
 * `new URL(path, base)` on its own is wrong for an API client. It follows the
 * URL spec, where a path starting with `/` is absolute against the *origin* and
 * therefore discards whatever path the base carried: a client on
 * `https://api.example.com/api` asked for `/auth/login` reaches
 * `https://api.example.com/auth/login`, and every request 404s with nothing in
 * the config that looks wrong. This function resolves the path against the base
 * *path* instead, so the leading slash is a matter of taste rather than a
 * silent 404, and `baseURL` + `prefix` are interchangeable ways to say the same
 * thing.
 *
 * The prefix is applied at most once: a path that already opens with it — say
 * `"/api/auth/login"` under a `"/api"` prefix — is left alone, so a codebase
 * migrating to `prefix` can move its call sites one at a time. The check is per
 * segment, so `/api-keys` is not mistaken for an already-prefixed path.
 *
 * A path that is itself an absolute URL wins over all of this, which is how a
 * client reaches a second host (a signed upload endpoint, a CDN) without a
 * second client.
 *
 * @example
 * buildApiUrl("https://api.example.com", "/auth/login", { prefix: "/api" });
 * // "https://api.example.com/api/auth/login"
 *
 * buildApiUrl("https://api.example.com/api", "auth/login");
 * // "https://api.example.com/api/auth/login"
 *
 * @param baseURL - Absolute base URL, or a path relative to the current origin.
 * @param path - The request path, or an absolute URL to use as-is.
 * @param options - Optional prefix and query params.
 * @returns The absolute URL to fetch.
 * @throws When `baseURL` is relative and there is no `location` to resolve it.
 */
export function buildApiUrl(
    baseURL: string,
    path: string,
    options: BuildApiUrlOptions = {},
): string {
    const { prefix, params } = options;
    const url = ABSOLUTE_URL.test(path) ? new URL(path) : new URL(resolve(baseURL, path, prefix));

    if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, String(value));
            }
        }
    }
    return url.toString();
}

/**
 * Build the absolute URL string for a path that is not already absolute.
 *
 * Kept separate from {@link buildApiUrl} so the query-param loop is not nested
 * inside the joining rules.
 *
 * @param baseURL - Absolute base URL, or a path relative to the current origin.
 * @param path - The request path.
 * @param prefix - Optional segment every request is nested under.
 * @returns The joined absolute URL.
 */
function resolve(baseURL: string, path: string, prefix?: string): string {
    const base = ABSOLUTE_URL.test(baseURL)
        ? new URL(baseURL)
        : new URL(baseURL, currentOrigin(baseURL));

    const queryStart = path.indexOf("?");
    const rawPath = queryStart === -1 ? path : path.slice(0, queryStart);
    const query = queryStart === -1 ? "" : path.slice(queryStart);

    const basePath = [...segments(base.pathname), ...segments(prefix ?? "")];
    const requested = segments(rawPath);
    const joined = startsWithSegments(requested, basePath)
        ? requested
        : [...basePath, ...requested];

    const trailing = rawPath.endsWith("/") ? "/" : "";
    const pathname = joined.length > 0 ? `/${joined.join("/")}${trailing}` : "/";
    return `${base.origin}${pathname}${query}`;
}

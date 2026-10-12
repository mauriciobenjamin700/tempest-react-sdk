/**
 * Header names treated as credentials by the service-worker helpers: never
 * persisted by `installBackgroundSync`, and a request carrying any of them
 * bypasses `installRuntimeCache` unless the route opts in. `Cookie` and
 * `Proxy-Authorization` are listed for completeness although the browser
 * forbids scripts from setting them — a cookie session is invisible to the
 * worker, which is why it depends on `Cache-Control` and `clearSessionData()`.
 */
export const DEFAULT_CREDENTIAL_HEADERS: readonly string[] = [
    "authorization",
    "proxy-authorization",
    "cookie",
    "x-api-key",
    "x-auth-token",
    "x-csrf-token",
    "x-xsrf-token",
];

/**
 * Lower-case a list of header names into a set for case-insensitive lookups.
 *
 * @param names - Header names, any case. Default {@link DEFAULT_CREDENTIAL_HEADERS}.
 * @returns The lower-cased set.
 */
export function credentialHeaderSet(
    names: readonly string[] = DEFAULT_CREDENTIAL_HEADERS,
): ReadonlySet<string> {
    return new Set(names.map((name) => name.toLowerCase()));
}

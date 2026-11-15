import { useLocation } from "react-router";

/**
 * Origin every candidate path is resolved against. Any value that resolves to a
 * different origin was never a path inside this app.
 */
const SENTINEL_ORIGIN = "http://return-to.invalid";

/**
 * Control characters and the backslash, which URL parsers strip or rewrite:
 * `/\tevil.example` and `/\\evil.example` both parse as `//evil.example`, a
 * protocol-relative URL to another host.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const SMUGGLING_CHARACTERS = /[\u0000-\u001F\u007F\\]/;

/**
 * The value as a same-origin path, or `null` when it is anything else.
 *
 * Accepts only a string that starts with `/`, carries no control character or
 * backslash, and resolves to the same origin it was resolved against — so
 * `https://evil.example`, `//evil.example`, `/\\evil.example` and
 * `javascript:alert(1)` are all refused. This is the check that makes a "go back
 * to where you were" destination safe to hand to `navigate()`: the value travels
 * through `history.state`, which any same-origin code can write, and a
 * destination that leaves the app is an open redirect.
 *
 * Use the result with the router's `navigate()` only. The path is relative to
 * the router's `basename`, as `useLocation()` reports it; `navigate()` puts the
 * `basename` back, while `location.assign()` would resolve it against the
 * origin root and miss the app in any deployment with a `basename`.
 *
 * @internal
 * @param value - Whatever was found under `location.state.from`.
 * @returns The path as given, or `null`.
 */
export function safeReturnPath(value: unknown): string | null {
    if (typeof value !== "string" || !value.startsWith("/")) return null;
    if (SMUGGLING_CHARACTERS.test(value)) return null;
    return new URL(value, SENTINEL_ORIGIN).origin === SENTINEL_ORIGIN ? value : null;
}

/**
 * Where the login screen should send the user back to after signing in.
 *
 * Reads `location.state.from`, which `<RouteGuard preserveFrom>` (and a route
 * with `preserveFrom: true`) writes when it redirects, and returns it only when
 * it is a same-origin path — anything else, including a missing state after a
 * reload of the login page or a direct visit, yields `fallback`. Validation is
 * here, not in the app, because a destination read from `history.state` and
 * followed blindly is an open redirect: the reader is the one line every app
 * would otherwise write slightly differently.
 *
 * The path is relative to the router's `basename`, exactly as `useLocation()`
 * reports it, so pass it to `navigate()`, not to `window.location`.
 *
 * @example
 * function Login() {
 *     const navigate = useNavigate();
 *     const returnTo = useReturnTo("/dashboard");
 *     const onSignedIn = () => navigate(returnTo, { replace: true });
 *     // ...
 * }
 *
 * @param fallback - Destination when there is no valid `from` (default: `"/"`).
 * @returns A same-origin path to navigate to.
 */
export function useReturnTo(fallback: string = "/"): string {
    const state: unknown = useLocation().state;
    const from: unknown =
        typeof state === "object" && state !== null
            ? (state as { from?: unknown }).from
            : undefined;
    return safeReturnPath(from) ?? fallback;
}

// The last mile of error handling: a typed error is what code reads, a sentence
// is what a person reads, and every app was writing the funnel between the two.
// The case everyone forgets is the request that never reached the server, which
// without special handling renders as the nonsense "erro 0".

import { isApiError, syntheticDetail } from "./errors";

/** The two fixed sentences {@link describeApiError} may need. */
export interface ApiErrorStrings {
    /** Shown when the request never reached the server. */
    offline: string;
}

/**
 * PT-BR defaults, used when no strings are supplied and no catalog answers.
 *
 * The SDK's copy is pt-BR everywhere else (`FilterBar`, `DataTable`, `Chat`), so
 * the default here matches rather than introducing an English string that only
 * shows up on a network failure.
 */
export const DEFAULT_API_ERROR_STRINGS: ApiErrorStrings = {
    offline: "Sem conexão com o servidor. Verifique sua internet e tente de novo.",
};

/**
 * Translation key the {@link useDescribeApiError} hook looks up.
 *
 * A catalog that does not define it falls back to
 * {@link DEFAULT_API_ERROR_STRINGS}, because `t` returns the key itself when the
 * lookup misses and printing `tempest.error.offline` at the user would be worse
 * than printing pt-BR at them.
 */
export const API_ERROR_OFFLINE_KEY = "tempest.error.offline";

/**
 * Whether the browser currently reports itself as offline.
 *
 * `fetch` rejects a network failure with a plain `TypeError` whose message
 * differs per browser ("Failed to fetch", "NetworkError when attempting to fetch
 * resource.", "Load failed"), so sniffing the message is not portable. The online
 * flag is, and it is the signal that matters for the sentence being chosen.
 *
 * @returns `true` only when the environment positively says it is offline.
 */
function browserIsOffline(): boolean {
    return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Turn any caught value into a sentence worth showing.
 *
 * The funnel, in order:
 *
 * 1. A request that never reached the server — `status === 0`, or a non-API
 *    error thrown while the browser reports itself offline — produces the
 *    offline sentence. This is the step apps skip, and skipping it renders
 *    "erro 0" or a raw `TypeError` at the user.
 * 2. The backend's own `detail`, which is the most specific thing available and
 *    is already written for a person.
 * 3. `fallback`, with `(HTTP <status>)` appended when a status is known, so the
 *    screenshot in the support ticket carries the one fact a developer needs.
 *
 * Pure on purpose: it works in an interceptor, in a logger and anywhere outside
 * the React tree. {@link useDescribeApiError} is the same funnel with the
 * sentences resolved through `I18nProvider`.
 *
 * @example
 * catch (error) {
 *     toast(describeApiError(error, "Não foi possível salvar o pedido"));
 * }
 *
 * @param error - The caught value, of any shape.
 * @param fallback - What to say when the error carries nothing better.
 * @param strings - Overrides for the fixed sentences.
 * @returns A sentence to show the user.
 */
export function describeApiError(
    error: unknown,
    fallback: string,
    strings?: Partial<ApiErrorStrings>,
): string {
    const offline = strings?.offline ?? DEFAULT_API_ERROR_STRINGS.offline;

    if (isApiError(error)) {
        if (error.status === 0) return offline;
        const detail = error.detail.trim();
        if (detail !== "" && detail !== syntheticDetail(error.status)) return detail;
        return `${fallback} (HTTP ${error.status})`;
    }

    if (browserIsOffline()) return offline;

    return fallback;
}

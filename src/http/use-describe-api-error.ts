import { useCallback } from "react";

import { useOptionalI18n } from "../i18n/I18nProvider";
import {
    API_ERROR_OFFLINE_KEY,
    API_ERROR_VALIDATION_KEY,
    DEFAULT_API_ERROR_STRINGS,
    describeApiError,
} from "./describe-api-error";

/**
 * {@link describeApiError} with its fixed sentences resolved through the active
 * `I18nProvider`.
 *
 * The funnel is not duplicated — this hook only supplies the strings and calls
 * the pure function. Which is also why both exist: the pure one runs in an
 * interceptor or a logger, where there is no React tree to read a context from,
 * and this one runs in a component without every caller passing translations
 * down by hand.
 *
 * Works with no provider at all: i18n is opt-in in this SDK, so a missing
 * provider — or a catalog that never defined `tempest.error.offline` — falls
 * back to the pt-BR default rather than crashing or printing the raw key.
 *
 * @example
 * const describe = useDescribeApiError();
 * const { mutate } = useMutation({
 *     mutationFn: save,
 *     onError: (error) => toast(describe(error, t("orders.saveFailed"))),
 * });
 *
 * @returns A stable `(error, fallback) => string` function.
 */
/**
 * Look one sentence up in the active catalog, falling back to the pt-BR default.
 *
 * `t` returns the key itself on a miss, so the identity check is what separates
 * "the catalog answered" from "the catalog has no such key" — printing
 * `tempest.error.validation` at a user is worse than printing pt-BR at them.
 *
 * @param translate - The active catalog's `t`, if any provider is mounted.
 * @param key - The translation key to look up.
 * @param fallbackKey - Which {@link DEFAULT_API_ERROR_STRINGS} entry to use on a miss.
 * @returns The sentence to hand to `describeApiError`.
 */
function resolve(
    translate: ((key: string) => string) | undefined,
    key: string,
    fallbackKey: keyof typeof DEFAULT_API_ERROR_STRINGS,
): string {
    const translated = translate?.(key);
    return translated && translated !== key ? translated : DEFAULT_API_ERROR_STRINGS[fallbackKey];
}

export function useDescribeApiError(): (error: unknown, fallback: string) => string {
    const i18n = useOptionalI18n();
    const translate = i18n?.t;

    return useCallback(
        (error: unknown, fallback: string) => {
            return describeApiError(error, fallback, {
                offline: resolve(translate, API_ERROR_OFFLINE_KEY, "offline"),
                validation: resolve(translate, API_ERROR_VALIDATION_KEY, "validation"),
            });
        },
        [translate],
    );
}

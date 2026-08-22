import { useCallback } from "react";

import { useOptionalI18n } from "../i18n/I18nProvider";
import {
    API_ERROR_OFFLINE_KEY,
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
 * The catalog miss is reported by the i18n layer, through `t`'s `default`. It
 * used to be re-derived here by comparing the result against the key that was
 * passed in, which is wrong for a catalog that maps a key to itself — and it was
 * the pattern every future translatable SDK string would have copied.
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
export function useDescribeApiError(): (error: unknown, fallback: string) => string {
    const i18n = useOptionalI18n();
    const translate = i18n?.t;

    return useCallback(
        (error: unknown, fallback: string) => {
            const offline =
                translate?.(API_ERROR_OFFLINE_KEY, undefined, {
                    default: DEFAULT_API_ERROR_STRINGS.offline,
                }) ?? DEFAULT_API_ERROR_STRINGS.offline;
            return describeApiError(error, fallback, { offline });
        },
        [translate],
    );
}

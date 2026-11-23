import { useMemo } from "react";

import type { InterpolationValues } from "./create-i18n";
import { useOptionalI18n } from "./I18nProvider";

/**
 * A component's built-in sentences, keyed the same in both languages the SDK
 * ships.
 */
export interface MessageTable<K extends string> {
    "pt-BR": Readonly<Record<K, string>>;
    en: Readonly<Record<K, string>>;
}

/** Resolver for one table of the SDK's default texts, from {@link useTempestText}. */
export interface TempestText<K extends string> {
    /** One sentence, with `{placeholders}` filled from `params`. */
    t: (key: K, params?: InterpolationValues) => string;
    /**
     * A counted sentence: `<base>_one` for 1, `<base>_other` otherwise; fills
     * `{count}`.
     */
    plural: (base: string, count: number, params?: InterpolationValues) => string;
}

/**
 * Fill `{name}` placeholders, leaving unknown ones untouched.
 *
 * @param template - The sentence.
 * @param params - Values per placeholder.
 * @returns The filled sentence.
 */
function fill(template: string, params?: InterpolationValues): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = params[name];
        return value === undefined ? match : String(value);
    });
}

/**
 * Whether a locale gets the built-in English table: `en` and `en-*`.
 *
 * @param locale - The active locale, or `undefined` with no provider.
 * @returns `true` for an English locale.
 */
export function isEnglishLocale(locale: string | undefined): boolean {
    return locale !== undefined && /^en(-|$)/i.test(locale);
}

/**
 * A component's default texts, resolved through the active `I18nProvider`.
 *
 * Internal: each component passes **its own** table, so a slice that renders an
 * `ErrorState` carries three sentences and not every default of the SDK —
 * `TEMPEST_MESSAGES` merges the same tables for the public catalog. The app's
 * catalog wins under the same key; on a miss the table answers in English for an
 * `en` locale and in pt-BR otherwise. With no provider it returns pt-BR, which
 * is what every component printed before (#746) — i18n stays opt-in.
 *
 * The miss is detected through `t`'s `default`, never by comparing the result
 * with the key, for the reason `useDescribeApiError` documents: a placeholder
 * catalog that maps a key to itself is a hit.
 *
 * @param table - The component's built-in sentences.
 * @returns A resolver for the active locale, stable while the locale is.
 */
export function useTempestText<K extends string>(table: MessageTable<K>): TempestText<K> {
    const i18n = useOptionalI18n();
    return useMemo<TempestText<K>>(() => {
        const builtin: Readonly<Record<string, string>> = isEnglishLocale(i18n?.locale)
            ? table.en
            : table["pt-BR"];
        return {
            t: (key, params) => {
                const fallback = builtin[key] ?? key;
                return i18n ? i18n.t(key, params, { default: fallback }) : fill(fallback, params);
            },
            plural: (base, count, params) => {
                const fallback = builtin[`${base}_${count === 1 ? "one" : "other"}`] ?? base;
                return i18n
                    ? i18n.plural(base, count, params, { default: fallback })
                    : fill(fallback, { count, ...params });
            },
        };
    }, [i18n, table]);
}

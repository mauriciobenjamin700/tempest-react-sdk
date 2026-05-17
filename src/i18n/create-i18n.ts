export type Messages = Record<string, string>;
export type Catalog = Record<string, Messages>;
export type InterpolationValues = Record<string, string | number>;

export interface CreateI18nOptions {
    /** Initial locale. */
    locale: string;
    /** Fallback locale used when a key is missing in the active locale. */
    fallbackLocale?: string;
    /** Catalog `{ [locale]: { [key]: "..." } }`. */
    messages: Catalog;
}

export interface I18n {
    /** Currently active locale. */
    locale: string;
    /** Fallback locale (or `null` when not configured). */
    fallbackLocale: string | null;
    /**
     * Translate `key`, interpolating `{name}` placeholders from `params`.
     * Falls back to the configured fallback locale, then to the key itself.
     */
    t: (key: string, params?: InterpolationValues) => string;
    /**
     * Plural-aware translation. Tries `${key}_one` for `count === 1` and
     * `${key}_other` otherwise, with `{count}` available for interpolation.
     */
    plural: (key: string, count: number, params?: InterpolationValues) => string;
    /** Format a number using `Intl.NumberFormat` on the active locale. */
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
    /** Format a Date using `Intl.DateTimeFormat` on the active locale. */
    formatDate: (value: Date | string, options?: Intl.DateTimeFormatOptions) => string;
    /** Build a new `I18n` instance pointing at a different locale. */
    withLocale: (locale: string) => I18n;
}

function interpolate(template: string, params?: InterpolationValues): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
        const value = params[name];
        return value === undefined ? `{${name}}` : String(value);
    });
}

function lookup(catalog: Catalog, locale: string, fallback: string | null, key: string): string | null {
    const direct = catalog[locale]?.[key];
    if (direct !== undefined) return direct;
    if (fallback) {
        const fallbackValue = catalog[fallback]?.[key];
        if (fallbackValue !== undefined) return fallbackValue;
    }
    return null;
}

/**
 * Create an i18n object with translation, pluralization and Intl helpers.
 *
 * The catalog is a plain `{ [locale]: { [key]: "..." } }` map — bring your
 * own keys, namespaces, or nested-key conventions. The SDK does not enforce
 * a schema so you can plug it into any string-loading pipeline.
 *
 * @example
 * const i18n = createI18n({
 *     locale: "pt-BR",
 *     fallbackLocale: "en",
 *     messages: {
 *         "pt-BR": {
 *             "greet": "Olá, {name}",
 *             "alos_one": "{count} Alô",
 *             "alos_other": "{count} Alôs",
 *         },
 *         "en": { greet: "Hi, {name}", alos_one: "{count} Alo", alos_other: "{count} Alos" },
 *     },
 * });
 * i18n.t("greet", { name: "Mau" });          // "Olá, Mau"
 * i18n.plural("alos", 3);                     // "3 Alôs"
 */
export function createI18n(options: CreateI18nOptions): I18n {
    const { locale, fallbackLocale = null, messages } = options;

    function t(key: string, params?: InterpolationValues): string {
        const template = lookup(messages, locale, fallbackLocale, key);
        if (template === null) return key;
        return interpolate(template, params);
    }

    function plural(key: string, count: number, params?: InterpolationValues): string {
        const suffix = count === 1 ? "_one" : "_other";
        const template =
            lookup(messages, locale, fallbackLocale, `${key}${suffix}`) ??
            lookup(messages, locale, fallbackLocale, key);
        if (template === null) return key;
        return interpolate(template, { count, ...(params ?? {}) });
    }

    function formatNumber(value: number, opts?: Intl.NumberFormatOptions): string {
        return new Intl.NumberFormat(locale, opts).format(value);
    }

    function formatDate(value: Date | string, opts?: Intl.DateTimeFormatOptions): string {
        const date = typeof value === "string" ? new Date(value) : value;
        if (Number.isNaN(date.getTime())) return "";
        return new Intl.DateTimeFormat(locale, opts).format(date);
    }

    return {
        locale,
        fallbackLocale,
        t,
        plural,
        formatNumber,
        formatDate,
        withLocale: (nextLocale) =>
            createI18n({ locale: nextLocale, fallbackLocale: fallbackLocale ?? undefined, messages }),
    };
}

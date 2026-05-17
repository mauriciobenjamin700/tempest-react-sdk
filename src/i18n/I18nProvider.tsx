import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createI18n, type Catalog, type I18n } from "./create-i18n";

export interface I18nContextValue extends I18n {
    /** Switch the active locale. Persisted when `storageKey` is set. */
    setLocale: (locale: string) => void;
    /** Locales available in the catalog. */
    availableLocales: string[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
    children: ReactNode;
    /** Initial locale. */
    locale: string;
    /** Fallback locale used when a key is missing. */
    fallbackLocale?: string;
    /** Translation catalog. */
    messages: Catalog;
    /** localStorage key for persisting the user choice. Pass `null` to disable. Default: `"tempest-locale"`. */
    storageKey?: string | null;
}

function readStored(storageKey: string | null, available: string[]): string | null {
    if (!storageKey || typeof window === "undefined") return null;
    try {
        const value = window.localStorage.getItem(storageKey);
        if (value && available.includes(value)) return value;
        return null;
    } catch {
        return null;
    }
}

/**
 * React provider for the SDK's lightweight i18n. Exposes the translation
 * helpers and a `setLocale` setter to children.
 */
export function I18nProvider({
    children,
    locale: initialLocale,
    fallbackLocale,
    messages,
    storageKey = "tempest-locale",
}: I18nProviderProps) {
    const availableLocales = useMemo(() => Object.keys(messages), [messages]);
    const [locale, setLocaleState] = useState<string>(
        () => readStored(storageKey, availableLocales) ?? initialLocale,
    );

    useEffect(() => {
        if (typeof document !== "undefined") {
            document.documentElement.setAttribute("lang", locale);
        }
    }, [locale]);

    const setLocale = useCallback(
        (next: string) => {
            setLocaleState(next);
            if (storageKey && typeof window !== "undefined") {
                try {
                    window.localStorage.setItem(storageKey, next);
                } catch {
                    /* ignore quota errors */
                }
            }
        },
        [storageKey],
    );

    const value = useMemo<I18nContextValue>(() => {
        const i18n = createI18n({ locale, fallbackLocale, messages });
        return { ...i18n, setLocale, availableLocales };
    }, [locale, fallbackLocale, messages, setLocale, availableLocales]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Access translation helpers. Must be used inside an {@link I18nProvider}.
 */
export function useI18n(): I18nContextValue {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error("useI18n must be used inside an <I18nProvider>");
    return ctx;
}

/**
 * Shortcut for components that only need the `t` function — avoids destructuring.
 */
export function useTranslate(): I18nContextValue["t"] {
    return useI18n().t;
}

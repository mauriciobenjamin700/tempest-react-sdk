import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { ReactNode } from "react";
import type { ResolvedTheme, ThemeMode } from "./types";

export interface ThemeContextValue {
    /** Raw user preference (light / dark / system). */
    theme: ThemeMode;
    /** Effective theme actually applied to the DOM (light or dark). */
    resolvedTheme: ResolvedTheme;
    /** Update the preference. Persisted to localStorage when `storageKey` is set. */
    setTheme: (next: ThemeMode) => void;
    /** Convenience: flip light ↔ dark. When in `system` mode, switches to the opposite of the current resolved theme. */
    toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
    children: ReactNode;
    /** Initial preference when nothing is stored. Default: `"system"`. */
    defaultTheme?: ThemeMode;
    /** localStorage key used to persist the preference. Pass `null` to disable persistence. Default: `"tempest-theme"`. */
    storageKey?: string | null;
    /**
     * Element that receives the `data-tempest-theme` attribute. Defaults to
     * `document.documentElement`. Override when scoping the theme to a subtree.
     */
    target?: () => HTMLElement | null;
    /** Attribute name written on the target. Default: `"data-tempest-theme"`. */
    attribute?: string;
}

function resolve(mode: ThemeMode): ResolvedTheme {
    if (mode === "dark" || mode === "light") return mode;
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStored(storageKey: string | null): ThemeMode | null {
    if (!storageKey || typeof window === "undefined") return null;
    try {
        const value = window.localStorage.getItem(storageKey);
        if (value === "light" || value === "dark" || value === "system") return value;
        return null;
    } catch {
        return null;
    }
}

/**
 * Wire dark/light theming. Writes a data attribute on a target element (the
 * `<html>` element by default) and exposes the current preference via
 * {@link useTheme}.
 *
 * Pair with `themeInitScript()` in the HTML head to prevent the flash of
 * incorrect theme on first paint.
 */
export function ThemeProvider({
    children,
    defaultTheme = "system",
    storageKey = "tempest-theme",
    target,
    attribute = "data-tempest-theme",
}: ThemeProviderProps) {
    const [theme, setThemeState] = useState<ThemeMode>(
        () => readStored(storageKey) ?? defaultTheme,
    );
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolve(theme));

    const targetRef = useRef<typeof target>(target);
    targetRef.current = target;

    useEffect(() => {
        const element = targetRef.current?.() ?? document.documentElement;
        if (!element) return;
        const next = resolve(theme);
        element.setAttribute(attribute, next);
        setResolvedTheme(next);
    }, [theme, attribute]);

    useEffect(() => {
        if (theme !== "system" || typeof window === "undefined") return;
        const list = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = (): void => {
            const element = targetRef.current?.() ?? document.documentElement;
            const next: ResolvedTheme = list.matches ? "dark" : "light";
            element?.setAttribute(attribute, next);
            setResolvedTheme(next);
        };
        list.addEventListener("change", handler);
        return () => list.removeEventListener("change", handler);
    }, [theme, attribute]);

    const setTheme = useCallback(
        (next: ThemeMode) => {
            setThemeState(next);
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

    const toggle = useCallback(() => {
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
    }, [resolvedTheme, setTheme]);

    const value = useMemo<ThemeContextValue>(
        () => ({ theme, resolvedTheme, setTheme, toggle }),
        [theme, resolvedTheme, setTheme, toggle],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Read and mutate the current theme. Must be used inside a {@link ThemeProvider}.
 */
export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error("useTheme must be used inside a <ThemeProvider>");
    return ctx;
}

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
     * Element that receives the theme attribute(s). Defaults to
     * `document.documentElement`. Override when scoping the theme to a subtree.
     */
    target?: () => HTMLElement | null;
    /**
     * Attribute name(s) written on the target with the resolved theme
     * (`"light"` / `"dark"`). Default: `"data-tempest-theme"`.
     *
     * Pass an array to mirror the theme onto more than one attribute — handy
     * when the SDK components read `data-tempest-theme` but the host app's own
     * CSS keys off a different attribute (e.g. `["data-tempest-theme",
     * "data-theme"]`). Avoids a separate sync effect in the consumer.
     */
    attribute?: string | string[];
    /**
     * When set, keeps `<meta name="theme-color">` in sync with the resolved
     * theme — `content` becomes `themeColor.dark` in dark mode and
     * `themeColor.light` in light mode. The meta tag must already exist in the
     * document `<head>`. No-op when omitted.
     */
    themeColor?: { light: string; dark: string };
}

function resolve(mode: ThemeMode): ResolvedTheme {
    if (mode === "dark" || mode === "light") return mode;
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Write the resolved theme onto every configured attribute and, when a
 * `themeColor` map is provided, sync the `<meta name="theme-color">` tag.
 */
function applyResolved(
    element: HTMLElement,
    resolved: ResolvedTheme,
    attribute: string | string[],
    themeColor?: { light: string; dark: string },
): void {
    const attrs = Array.isArray(attribute) ? attribute : [attribute];
    for (const attr of attrs) element.setAttribute(attr, resolved);
    if (themeColor && typeof document !== "undefined") {
        const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (meta) meta.content = themeColor[resolved];
    }
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
    themeColor,
}: ThemeProviderProps) {
    const [theme, setThemeState] = useState<ThemeMode>(
        () => readStored(storageKey) ?? defaultTheme,
    );
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolve(theme));

    const targetRef = useRef<typeof target>(target);
    targetRef.current = target;

    const attributeKey = Array.isArray(attribute) ? attribute.join(",") : attribute;
    const themeColorRef = useRef(themeColor);
    themeColorRef.current = themeColor;

    useEffect(() => {
        const element = targetRef.current?.() ?? document.documentElement;
        if (!element) return;
        const next = resolve(theme);
        applyResolved(element, next, attribute, themeColorRef.current);
        setResolvedTheme(next);
        // attributeKey is the stable string form of `attribute`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [theme, attributeKey]);

    useEffect(() => {
        if (theme !== "system" || typeof window === "undefined") return;
        const list = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = (): void => {
            const element = targetRef.current?.() ?? document.documentElement;
            if (!element) return;
            const next: ResolvedTheme = list.matches ? "dark" : "light";
            applyResolved(element, next, attribute, themeColorRef.current);
            setResolvedTheme(next);
        };
        list.addEventListener("change", handler);
        return () => list.removeEventListener("change", handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [theme, attributeKey]);

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

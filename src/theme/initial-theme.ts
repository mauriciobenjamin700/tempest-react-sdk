import type { ResolvedTheme, ThemeMode } from "./types";

export interface GetInitialThemeOptions {
    /** localStorage key. Default: `"tempest-theme"`. */
    storageKey?: string;
    /** Theme used when nothing is stored and the user has no system preference. */
    defaultTheme?: ThemeMode;
}

/**
 * Inline-safe theme resolution intended for early bootstrap (e.g. inside the
 * `<head>` script that prevents the flash of incorrect theme). Reads from
 * localStorage and falls back to `prefers-color-scheme`.
 */
export function getInitialTheme(options: GetInitialThemeOptions = {}): ResolvedTheme {
    const { storageKey = "tempest-theme", defaultTheme = "system" } = options;

    if (typeof window === "undefined") {
        return defaultTheme === "dark" ? "dark" : "light";
    }

    let stored: ThemeMode | null = null;
    try {
        stored = window.localStorage.getItem(storageKey) as ThemeMode | null;
    } catch {
        stored = null;
    }

    const mode: ThemeMode = stored ?? defaultTheme;
    if (mode === "dark" || mode === "light") return mode;

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Plain HTML snippet that sets `data-tempest-theme` on `<html>` before React
 * hydrates. Inline this in `<head>` to avoid a flash of the wrong theme on
 * first paint.
 *
 * @example
 * <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
 */
export function themeInitScript(options: GetInitialThemeOptions = {}): string {
    const storageKey = options.storageKey ?? "tempest-theme";
    const defaultTheme = options.defaultTheme ?? "system";
    return `
(function(){try{
  var key=${JSON.stringify(storageKey)};
  var def=${JSON.stringify(defaultTheme)};
  var stored=localStorage.getItem(key);
  var mode=stored||def;
  var resolved=mode==="dark"||mode==="light"?mode:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
  document.documentElement.setAttribute("data-tempest-theme",resolved);
}catch(e){}})();
`.trim();
}

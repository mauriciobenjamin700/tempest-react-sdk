import { storage } from "@/utils/storage";
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

    const stored = storage.getRaw(storageKey) as ThemeMode | null;
    const mode: ThemeMode = stored ?? defaultTheme;
    if (mode === "dark" || mode === "light") return mode;

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * A string as a JavaScript literal that is also safe inside an HTML `<script>`.
 *
 * `JSON.stringify` produces a valid literal but leaves `<`, `>`, `&` and the
 * line separators U+2028/U+2029 as they are, and the HTML parser ends a script
 * element at the first `</script` whatever JavaScript thinks of it: a
 * `storageKey` of `"</script><script>alert(1)</script>"` closed the snippet and
 * ran the second script. Each of those characters is written as its `\uXXXX`
 * escape, which JavaScript reads back to the same string.
 *
 * @param value - The option value to embed.
 * @returns The quoted, escaped literal.
 */
function scriptLiteral(value: string): string {
    return JSON.stringify(value).replace(
        /[<>&\u2028\u2029]/g,
        (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
}

/**
 * Plain HTML snippet that sets `data-tempest-theme` on `<html>` before React
 * hydrates. Inline this in `<head>` to avoid a flash of the wrong theme on
 * first paint.
 *
 * Both options are embedded through an escaper that keeps them inside the
 * `<script>` element whatever they contain, so the snippet is safe to inline
 * even when the storage key comes from configuration.
 *
 * @example
 * <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
 */
export function themeInitScript(options: GetInitialThemeOptions = {}): string {
    const storageKey = options.storageKey ?? "tempest-theme";
    const defaultTheme = options.defaultTheme ?? "system";
    return `
(function(){try{
  var key=${scriptLiteral(storageKey)};
  var def=${scriptLiteral(defaultTheme)};
  var stored=localStorage.getItem(key);
  var mode=stored||def;
  var resolved=mode==="dark"||mode==="light"?mode:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
  document.documentElement.setAttribute("data-tempest-theme",resolved);
}catch(e){}})();
`.trim();
}

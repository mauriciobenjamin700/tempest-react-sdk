import { storage } from "@/utils/storage";
import type { GetInitialThemeOptions } from "./theme-init-script";
import type { ResolvedTheme, ThemeMode } from "./types";

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

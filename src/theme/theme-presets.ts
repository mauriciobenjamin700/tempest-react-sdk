/**
 * Ready-made brand descriptions for {@link createTheme}.
 *
 * Each preset is a plain {@link CreateThemeOptions} object — data, not CSS — so
 * an app can spread one and override a single field (`{ ...themePresets.violet,
 * radius: "full" }`) instead of forking a stylesheet. The chart arrays keep the
 * `/charts` module in the same family as the brand, which is the whole point of
 * `--tempest-chart-*`.
 */
import type { CreateThemeOptions } from "./create-theme";

/** Name of a bundled preset. */
export type ThemePresetName = "tempest" | "violet" | "emerald" | "rose" | "slate" | "amber";

/**
 * The bundled presets.
 *
 * `tempest` restates the SDK's own defaults — useful as a starting point to
 * tweak, and as the "reset to default" entry in a theme picker.
 */
export const themePresets: Record<ThemePresetName, CreateThemeOptions> = {
    tempest: {
        primary: "#0066ff",
        gray: "#667085",
        chart: ["#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#ec4899", "#06b6d4"],
    },
    violet: {
        primary: "#7c3aed",
        gray: "#6b7280",
        chart: ["#7c3aed", "#0ea5e9", "#22c55e", "#f59e0b", "#ec4899", "#14b8a6"],
    },
    emerald: {
        primary: "#059669",
        gray: "#64748b",
        chart: ["#059669", "#0ea5e9", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6"],
    },
    rose: {
        primary: "#e11d48",
        gray: "#71717a",
        chart: ["#e11d48", "#7c3aed", "#0ea5e9", "#16a34a", "#f59e0b", "#06b6d4"],
    },
    slate: {
        primary: "#475569",
        gray: "#64748b",
        chart: ["#475569", "#0ea5e9", "#16a34a", "#f59e0b", "#a855f7", "#06b6d4"],
    },
    amber: {
        primary: "#d97706",
        gray: "#78716c",
        chart: ["#d97706", "#0284c7", "#16a34a", "#7c3aed", "#dc2626", "#0891b2"],
    },
};

/**
 * Look up a preset by name.
 *
 * @param name - Preset name.
 * @returns The preset options, or `undefined` when the name is unknown (so a
 *   value coming from `localStorage` or a query string cannot crash boot).
 */
export function getThemePreset(name: string): CreateThemeOptions | undefined {
    return themePresets[name as ThemePresetName];
}

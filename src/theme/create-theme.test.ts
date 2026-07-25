import { describe, expect, it } from "vitest";

import { contrastRatio } from "./color";
import { createTheme, themeContrast } from "./create-theme";
import { getThemePreset, themePresets } from "./theme-presets";

describe("createTheme", () => {
    it("returns empty blocks when nothing is requested", () => {
        const theme = createTheme();
        expect(theme.light).toEqual({});
        expect(theme.dark).toEqual({});
        expect(theme.css).toBe("");
    });

    it("generates the full primary scale for both schemes", () => {
        const { light, dark } = createTheme({ primary: "#7c3aed" });
        for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
            expect(light[`--tempest-primary-${step}`]).toMatch(/^#[0-9a-f]{6}$/);
            expect(dark[`--tempest-primary-${step}`]).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it("inverts the hover/active aliases in dark mode", () => {
        const { light, dark } = createTheme({ primary: "#0066ff" });
        expect(light["--tempest-primary-hover"]).toBe("var(--tempest-primary-600)");
        expect(dark["--tempest-primary-hover"]).toBe("var(--tempest-primary-400)");
        expect(light["--tempest-primary-soft"]).toBe("var(--tempest-primary-50)");
        expect(dark["--tempest-primary-soft"]).toBe("var(--tempest-primary-100)");
    });

    it("picks the on-soft step by measured contrast, not by convention", () => {
        const { light, dark } = createTheme({ primary: "#0066ff" });
        expect(light["--tempest-primary-on-soft"]).toMatch(
            /^var\(--tempest-primary-(600|700|800|900)\)$/,
        );
        expect(dark["--tempest-primary-on-soft"]).toMatch(
            /^var\(--tempest-primary-(700|800|900)\)$/,
        );
    });

    it("picks a readable primary foreground for a light brand", () => {
        const { light } = createTheme({ primary: "#fde047" });
        expect(light["--tempest-primary-foreground"]).toBe("#101828");
        expect(light["--tempest-text-on-primary"]).toBe("#101828");
    });

    it("derives the focus ring from the brand color with the requested alpha", () => {
        const { light } = createTheme({ primary: "#0066ff", focusRingAlpha: 0.5 });
        expect(light["--tempest-focus-ring-color"]).toMatch(/^rgb\(\d+ \d+ \d+ \/ 0\.5\)$/);
    });

    it("defaults the focus ring alpha to 0.35", () => {
        const { light } = createTheme({ primary: "#0066ff" });
        expect(light["--tempest-focus-ring-color"]).toContain("/ 0.35)");
    });

    it("wires neutral aliases when a gray is given", () => {
        const { light, dark } = createTheme({ gray: "#667085" });
        expect(light["--tempest-bg"]).toBe("#ffffff");
        expect(light["--tempest-surface"]).toBe("var(--tempest-gray-50)");
        expect(light["--tempest-text-muted"]).toBe("var(--tempest-gray-600)");
        expect(dark["--tempest-bg"]).toMatch(/^#[0-9a-f]{6}$/);
        expect(dark["--tempest-border-strong"]).toBe("var(--tempest-gray-400)");
    });

    it("leaves families untouched when they are not requested", () => {
        const { light } = createTheme({ primary: "#0066ff" });
        expect(light["--tempest-gray-500"]).toBeUndefined();
        expect(light["--tempest-success"]).toBeUndefined();
    });

    it("regenerates each status family it is given", () => {
        const { light, dark } = createTheme({
            success: "#16a34a",
            warning: "#d97706",
            danger: "#dc2626",
            info: "#0284c7",
        });
        for (const status of ["success", "warning", "danger", "info"]) {
            for (const suffix of ["", "-fg", "-bg", "-border", "-solid"]) {
                expect(light[`--tempest-${status}${suffix}`]).toMatch(/^#[0-9a-f]{6}$/);
                expect(dark[`--tempest-${status}${suffix}`]).toMatch(/^#[0-9a-f]{6}$/);
            }
        }
    });

    it("writes one chart token per provided series color", () => {
        const { light } = createTheme({ chart: ["#111111", "#222222", "#333333"] });
        expect(light["--tempest-chart-1"]).toBe("#111111");
        expect(light["--tempest-chart-3"]).toBe("#333333");
        expect(light["--tempest-chart-4"]).toBeUndefined();
    });

    it("declares how many series colors the theme owns", () => {
        const { light } = createTheme({ chart: ["#111111", "#222222", "#333333"] });
        expect(light["--tempest-chart-count"]).toBe("3");
    });

    it("omits the count when no chart colors are given", () => {
        expect(createTheme({ primary: "#0066ff" }).light["--tempest-chart-count"]).toBeUndefined();
    });

    it("ignores an empty chart array", () => {
        expect(createTheme({ chart: [] }).light["--tempest-chart-1"]).toBeUndefined();
    });

    it("applies a radius preset", () => {
        const { light } = createTheme({ radius: "full" });
        expect(light["--tempest-radius-md"]).toBe("9999px");
        expect(light["--tempest-radius-xs"]).toBe("4px");
    });

    it("applies explicit per-step radii", () => {
        const { light } = createTheme({ radius: { md: "10px" } });
        expect(light["--tempest-radius-md"]).toBe("10px");
        expect(light["--tempest-radius-lg"]).toBeUndefined();
    });

    it("zeroes every radius with the none preset", () => {
        const { light } = createTheme({ radius: "none" });
        expect(light["--tempest-radius-2xl"]).toBe("0");
    });

    it("renders css under the default selectors", () => {
        const { css } = createTheme({ primary: "#0066ff" });
        expect(css).toContain(":root {");
        expect(css).toContain('[data-tempest-theme="dark"] {');
        expect(css).toContain("--tempest-primary-500:");
    });

    it("honours custom selectors", () => {
        const { css } = createTheme({
            primary: "#0066ff",
            selector: ".brand-a",
            darkSelector: '.brand-a[data-tempest-theme="dark"]',
        });
        expect(css).toContain(".brand-a {");
        expect(css).toContain('.brand-a[data-tempest-theme="dark"] {');
        expect(css).not.toContain(":root {");
    });

    it("omits the dark block when only light tokens exist", () => {
        const { css } = createTheme({ radius: "sm" });
        expect(css).toContain(":root {");
        expect(css).not.toContain("data-tempest-theme");
    });
});

describe("themeContrast", () => {
    it("returns null without a brand color", () => {
        expect(themeContrast({})).toBeNull();
    });

    it("measures the generated foreground against the brand", () => {
        const ratio = themeContrast({ primary: "#0066ff" });
        expect(ratio).not.toBeNull();
        expect(ratio as number).toBeGreaterThan(3);
    });

    it("keeps every bundled preset readable for button labels (AA large)", () => {
        for (const name of Object.keys(themePresets)) {
            const ratio = themeContrast(themePresets[name as keyof typeof themePresets]);
            expect(ratio as number).toBeGreaterThanOrEqual(3);
        }
    });
});

describe("themePresets", () => {
    it("ships a brand, a neutral and chart colors per preset", () => {
        for (const preset of Object.values(themePresets)) {
            expect(preset.primary).toMatch(/^#[0-9a-f]{6}$/);
            expect(preset.gray).toMatch(/^#[0-9a-f]{6}$/);
            expect(preset.chart?.length).toBeGreaterThanOrEqual(4);
        }
    });

    it("generates distinguishable series colors", () => {
        const chart = themePresets.violet.chart as string[];
        expect(new Set(chart).size).toBe(chart.length);
    });

    it("keeps the tempest preset aligned with the built-in brand", () => {
        expect(themePresets.tempest.primary).toBe("#0066ff");
    });

    it("resolves a preset by name", () => {
        expect(getThemePreset("emerald")).toBe(themePresets.emerald);
    });

    it("returns undefined for an unknown name", () => {
        expect(getThemePreset("neon-hotdog")).toBeUndefined();
    });

    it("keeps text on the soft tint at AA for every preset, in both schemes", () => {
        const stepOf = (token: string): string =>
            token.replace("var(--tempest-primary-", "").replace(")", "");

        for (const preset of Object.values(themePresets)) {
            const { light, dark } = createTheme(preset);

            const lightSoft = light["--tempest-primary-50"];
            const lightOnSoft =
                light[`--tempest-primary-${stepOf(light["--tempest-primary-on-soft"])}`];
            expect(contrastRatio(lightSoft, lightOnSoft)).toBeGreaterThanOrEqual(4.5);

            const darkSoft = dark["--tempest-primary-100"];
            const darkOnSoft =
                dark[`--tempest-primary-${stepOf(dark["--tempest-primary-on-soft"])}`];
            expect(contrastRatio(darkSoft, darkOnSoft)).toBeGreaterThanOrEqual(4.5);
        }
    });
});

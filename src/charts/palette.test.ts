import { afterEach, describe, expect, it } from "vitest";

import {
    CHART_COLOR_TOKEN_COUNT,
    DEFAULT_CHART_COLORS,
    resolveChartChrome,
    resolveChartColors,
} from "./palette";

function setTokens(values: string[], element: HTMLElement = document.documentElement): void {
    values.forEach((value, index) => {
        element.style.setProperty(`--tempest-chart-${index + 1}`, value);
    });
}

afterEach(() => {
    document.documentElement.removeAttribute("style");
});

describe("resolveChartColors", () => {
    it("falls back to the default palette when no token is set", () => {
        expect(resolveChartColors()).toEqual(DEFAULT_CHART_COLORS);
    });

    it("reads the tokens from the root element", () => {
        setTokens(["#111111", "#222222"]);
        expect(resolveChartColors()).toEqual(["#111111", "#222222"]);
    });

    it("stops at the first unset token instead of leaving a stale tail", () => {
        document.documentElement.style.setProperty("--tempest-chart-1", "#aaaaaa");
        document.documentElement.style.setProperty("--tempest-chart-3", "#cccccc");

        expect(resolveChartColors()).toEqual(["#aaaaaa"]);
    });

    it("reads at most the number of tokens the SDK ships", () => {
        setTokens(Array.from({ length: CHART_COLOR_TOKEN_COUNT + 2 }, (_, i) => `#00000${i % 10}`));
        expect(resolveChartColors()).toHaveLength(CHART_COLOR_TOKEN_COUNT);
    });

    it("resolves against an explicit element, so a scoped theme wins", () => {
        setTokens(["#ffffff"]);
        const host = document.createElement("div");
        setTokens(["#123456", "#654321"], host);
        document.body.appendChild(host);

        expect(resolveChartColors(host)).toEqual(["#123456", "#654321"]);

        host.remove();
    });

    it("honours --tempest-chart-count so a brand palette is not padded with defaults", () => {
        setTokens(["#111111", "#222222", "#333333"]);
        document.documentElement.style.setProperty("--tempest-chart-count", "3");

        expect(resolveChartColors()).toEqual(["#111111", "#222222", "#333333"]);
    });

    it("keeps reading past the count when the theme declares more than it set", () => {
        setTokens(["#111111", "#222222"]);
        document.documentElement.style.setProperty("--tempest-chart-count", "6");

        expect(resolveChartColors()).toEqual(["#111111", "#222222"]);
    });

    it("clamps the declared count to the tokens the SDK ships", () => {
        setTokens(Array.from({ length: CHART_COLOR_TOKEN_COUNT }, (_, i) => `#00000${i}`));
        document.documentElement.style.setProperty("--tempest-chart-count", "99");

        expect(resolveChartColors()).toHaveLength(CHART_COLOR_TOKEN_COUNT);
    });

    it("ignores a malformed count", () => {
        setTokens(["#111111", "#222222"]);
        document.documentElement.style.setProperty("--tempest-chart-count", "abc");

        expect(resolveChartColors()).toEqual(["#111111", "#222222"]);
    });

    it("trims whitespace around a token value", () => {
        document.documentElement.style.setProperty("--tempest-chart-1", "  #abcdef  ");
        expect(resolveChartColors()).toEqual(["#abcdef"]);
    });
});

describe("resolveChartChrome", () => {
    it("returns the built-in fallbacks when unset", () => {
        expect(resolveChartChrome("grid")).toBe("#e4e7ec");
        expect(resolveChartChrome("axis")).toBe("#667085");
    });

    it("reads the grid and axis tokens", () => {
        document.documentElement.style.setProperty("--tempest-chart-grid", "#eeeeee");
        document.documentElement.style.setProperty("--tempest-chart-axis", "#555555");

        expect(resolveChartChrome("grid")).toBe("#eeeeee");
        expect(resolveChartChrome("axis")).toBe("#555555");
    });

    it("honours a custom fallback", () => {
        expect(resolveChartChrome("grid", undefined, "#000000")).toBe("#000000");
    });

    it("resolves against an explicit element", () => {
        const host = document.createElement("div");
        host.style.setProperty("--tempest-chart-grid", "#101010");
        document.body.appendChild(host);

        expect(resolveChartChrome("grid", host)).toBe("#101010");

        host.remove();
    });
});

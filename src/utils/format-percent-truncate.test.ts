import { describe, expect, it } from "vitest";
import { formatPercent } from "./format";

describe("formatPercent truncate mode", () => {
    it("does not round a confidence just under 100% up to certainty", () => {
        expect(formatPercent(0.99996, { decimals: 2 })).toBe("100,00%");
        expect(formatPercent(0.99996, { decimals: 2, mode: "truncate" })).toBe("99,99%");
        expect(formatPercent(0.99999, { mode: "truncate" })).toBe("99,9%");
    });

    it("keeps exact values whose binary product falls just below the integer", () => {
        expect(0.29 * 100).toBeLessThan(29);
        expect(0.57 * 10000).toBeLessThan(5700);
        expect(formatPercent(0.29, { decimals: 0, mode: "truncate" })).toBe("29%");
        expect(formatPercent(0.29, { decimals: 2, mode: "truncate" })).toBe("29,00%");
        expect(formatPercent(0.57, { decimals: 2, mode: "truncate" })).toBe("57,00%");
        expect(formatPercent(1.13, { decimals: 2, mode: "truncate" })).toBe("113,00%");
    });

    it("truncates every four-digit fraction to its exact two-decimal percent", () => {
        const wrong: number[] = [];
        for (let i = 0; i <= 10000; i++) {
            const expected = `${Math.floor(i / 100)},${String(i % 100).padStart(2, "0")}%`;
            const got = formatPercent(i / 10000, { decimals: 2, mode: "truncate" }).replace(
                /\./g,
                "",
            );
            if (got !== expected) wrong.push(i);
        }
        expect(wrong).toEqual([]);
    });

    it("cuts toward zero for negatives and never renders a negative zero", () => {
        expect(formatPercent(-0.12345, { decimals: 2, mode: "truncate" })).toBe("-12,34%");
        expect(formatPercent(-0.000001, { mode: "truncate" })).toBe("0,0%");
    });

    it("handles values whose string form uses exponent notation", () => {
        expect(formatPercent(1e-7, { decimals: 2, mode: "truncate" })).toBe("0,00%");
        expect(formatPercent(1.5e-5, { decimals: 3, mode: "truncate" })).toBe("0,001%");
    });

    it("keeps rounding as the default mode", () => {
        expect(formatPercent(0.12345, { decimals: 2 })).toBe("12,35%");
        expect(formatPercent(0.12345, { decimals: 2, mode: "round" })).toBe("12,35%");
        expect(formatPercent(0.12345, { decimals: 2, mode: "truncate" })).toBe("12,34%");
    });

    it("still answers the fallback for absent or non-finite input", () => {
        expect(formatPercent(null, { mode: "truncate" })).toBe("—");
        expect(formatPercent(Number.NaN, { mode: "truncate" })).toBe("—");
        expect(formatPercent(Infinity, { mode: "truncate", fallback: "n/d" })).toBe("n/d");
    });
});

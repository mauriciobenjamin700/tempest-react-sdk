import { describe, expect, it } from "vitest";
import { clamp } from "./numbers";

describe("clamp", () => {
    it("returns the value when in range", () => {
        expect(clamp(5, 0, 10)).toBe(5);
    });

    it("returns min when value below", () => {
        expect(clamp(-1, 0, 10)).toBe(0);
    });

    it("returns max when value above", () => {
        expect(clamp(11, 0, 10)).toBe(10);
    });

    it("accepts swapped min/max gracefully", () => {
        expect(clamp(5, 10, 0)).toBe(5);
        expect(clamp(-1, 10, 0)).toBe(0);
        expect(clamp(11, 10, 0)).toBe(10);
    });

    it("propagates NaN", () => {
        expect(Number.isNaN(clamp(NaN, 0, 10))).toBe(true);
    });
});

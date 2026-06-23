import { describe, expect, it } from "vitest";
import { clamp, formatBytes, formatCompactNumber } from "./numbers";

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

describe("formatBytes", () => {
    it("renders 0 as 0 B", () => {
        expect(formatBytes(0)).toBe("0 B");
    });

    it("formats bytes without decimals", () => {
        expect(formatBytes(512)).toBe("512 B");
    });

    it("formats kilobytes with default decimals", () => {
        expect(formatBytes(1536)).toBe("1.5 KB");
    });

    it("formats exact megabytes without trailing zeros", () => {
        expect(formatBytes(1048576)).toBe("1 MB");
    });

    it("respects a custom decimals value", () => {
        expect(formatBytes(1536, 2)).toBe("1.5 KB");
        expect(formatBytes(1610612736, 2)).toBe("1.5 GB");
    });

    it("scales up to terabytes", () => {
        expect(formatBytes(1099511627776)).toBe("1 TB");
    });
});

describe("formatCompactNumber", () => {
    it("formats thousands in en-US", () => {
        expect(formatCompactNumber(1234)).toBe("1.2K");
    });

    it("formats millions in en-US", () => {
        expect(formatCompactNumber(5600000)).toBe("5.6M");
    });

    it("respects a custom locale", () => {
        // pt-BR uses a comma decimal separator and a "mil" suffix; ICU may
        // separate them with a non-breaking space, so normalize whitespace.
        const result = formatCompactNumber(1234, "pt-BR").replace(/\s+/g, " ");
        expect(result).toBe("1,2 mil");
    });
});

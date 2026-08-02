import { describe, expect, it } from "vitest";

import { formatDuration } from "./duration";

describe("formatDuration", () => {
    it("formats seconds with a padded field", () => {
        expect(formatDuration(0)).toBe("0:00");
        expect(formatDuration(7_000)).toBe("0:07");
        expect(formatDuration(61_000)).toBe("1:01");
    });

    it("omits the hour field until there is one", () => {
        expect(formatDuration(59 * 60_000 + 59_000)).toBe("59:59");
        expect(formatDuration(3_600_000)).toBe("1:00:00");
        expect(formatDuration(3_792_000)).toBe("1:03:12");
    });

    it("truncates rather than rounds, so a clock never shows a time not reached", () => {
        expect(formatDuration(1_999)).toBe("0:01");
    });

    it("returns a placeholder for the unknown-duration case", () => {
        // `<audio>.duration` on a fresh MediaRecorder blob is `Infinity`; rendering
        // `NaN:aN` there is the bug this guards.
        expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("--:--");
        expect(formatDuration(Number.NaN)).toBe("--:--");
        expect(formatDuration(-1)).toBe("--:--");
    });
});

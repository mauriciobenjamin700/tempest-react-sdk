import { describe, expect, it } from "vitest";
import { CACHE_TIME, REFETCH_TIME, STALE_TIME } from "./constants";

describe("query constants", () => {
    it("STALE_TIME presets are positive", () => {
        expect(STALE_TIME.SHORT).toBeGreaterThan(0);
        expect(STALE_TIME.DEFAULT).toBeGreaterThan(STALE_TIME.SHORT);
        expect(STALE_TIME.LONG).toBeGreaterThan(STALE_TIME.DEFAULT);
        expect(STALE_TIME.INFINITE).toBe(Infinity);
    });

    it("CACHE_TIME presets are positive", () => {
        expect(CACHE_TIME.SHORT).toBeGreaterThan(0);
        expect(CACHE_TIME.LONG).toBeGreaterThan(CACHE_TIME.SHORT);
    });

    it("REFETCH_TIME presets are positive", () => {
        expect(REFETCH_TIME.REALTIME).toBeGreaterThan(0);
    });
});

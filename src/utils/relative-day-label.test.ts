import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearIntlCache } from "./intl-cache";
import { relativeDayLabel } from "./relative-time";

const previousTz = process.env.TZ;

beforeEach(() => {
    process.env.TZ = "America/Sao_Paulo";
    clearIntlCache();
});

afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = previousTz;
    clearIntlCache();
});

describe("relativeDayLabel", () => {
    it("labels the current and previous local day, and formats any other day", () => {
        const now = new Date(2026, 4, 16, 15, 0);
        expect(relativeDayLabel(new Date(2026, 4, 16, 0, 0), { now })).toBe("Hoje");
        expect(relativeDayLabel(new Date(2026, 4, 15, 23, 59), { now })).toBe("Ontem");
        expect(relativeDayLabel(new Date(2026, 4, 14, 12, 0), { now })).toBe("14/05/2026");
        expect(relativeDayLabel(new Date(2026, 4, 17, 9, 0), { now })).toBe("17/05/2026");
    });

    it("flips the labels exactly at local midnight under fake timers", () => {
        vi.useFakeTimers();
        const lateMessage = new Date(2026, 4, 16, 23, 50);

        vi.setSystemTime(new Date(2026, 4, 16, 23, 59, 59, 999));
        expect(relativeDayLabel(lateMessage)).toBe("Hoje");

        vi.setSystemTime(new Date(2026, 4, 17, 0, 0, 0, 0));
        expect(relativeDayLabel(lateMessage)).toBe("Ontem");

        vi.setSystemTime(new Date(2026, 4, 18, 0, 0, 0, 0));
        expect(relativeDayLabel(lateMessage)).toBe("16/05/2026");
    });

    it("uses the local zone, not UTC, for an instant near midnight", () => {
        const now = new Date("2026-05-17T01:00:00Z");
        expect(relativeDayLabel("2026-05-17T00:30:00Z", { now })).toBe("Hoje");
        expect(relativeDayLabel("2026-05-16T02:00:00Z", { now })).toBe("Ontem");
    });

    it("reads a bare yyyy-MM-dd as a local date instead of UTC midnight", () => {
        const now = new Date(2026, 4, 16, 10, 0);
        expect(relativeDayLabel("2026-05-16", { now })).toBe("Hoje");
        expect(relativeDayLabel("2026-05-15", { now })).toBe("Ontem");
    });

    it("finds yesterday by calendar day across a daylight-saving shift", () => {
        process.env.TZ = "America/New_York";
        const now = new Date(2026, 2, 9, 0, 30);
        expect(relativeDayLabel(new Date(2026, 2, 8, 0, 10), { now })).toBe("Ontem");
        expect(relativeDayLabel(new Date(2026, 2, 7, 23, 50), { now })).toBe("07/03/2026");
    });

    it("follows the locale for labels and date format", () => {
        const now = new Date(2026, 4, 16, 10, 0);
        expect(relativeDayLabel(now, { now, locale: "en" })).toBe("Today");
        expect(relativeDayLabel(new Date(2026, 4, 15), { now, locale: "en" })).toBe("Yesterday");
        expect(relativeDayLabel(new Date(2026, 4, 10), { now, locale: "en" })).toBe("5/10/2026");
    });

    it("lets the caller override one label and keep the other", () => {
        const now = new Date(2026, 4, 16, 10, 0);
        const labels = { today: "Agora há pouco" };
        expect(relativeDayLabel(now, { now, labels })).toBe("Agora há pouco");
        expect(relativeDayLabel(new Date(2026, 4, 15), { now, labels })).toBe("Ontem");
    });

    it("accepts epoch milliseconds", () => {
        const now = new Date(2026, 4, 16, 10, 0);
        expect(relativeDayLabel(now.getTime(), { now: now.getTime() })).toBe("Hoje");
    });

    it("answers the fallback when absent and an empty string when invalid", () => {
        expect(relativeDayLabel(null)).toBe("—");
        expect(relativeDayLabel(undefined, { fallback: "sem data" })).toBe("sem data");
        expect(relativeDayLabel("banana")).toBe("");
    });
});

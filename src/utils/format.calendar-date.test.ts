import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createI18n } from "@/i18n/create-i18n";
import { formatDate, formatDateTime, formatTime } from "./format";
import { clearIntlCache } from "./intl-cache";

const previousTz = process.env.TZ;

/**
 * Run the body with the process in `zone`, on a cold `Intl` cache.
 *
 * The cache keys formatters by locale and options, not by zone, so a formatter
 * built under one zone would keep printing in it after `TZ` changes.
 *
 * @param zone - The IANA zone to switch to.
 */
function inZone(zone: string): void {
    process.env.TZ = zone;
    clearIntlCache();
}

beforeEach(() => inZone("America/Sao_Paulo"));

afterEach(() => {
    process.env.TZ = previousTz;
    clearIntlCache();
});

describe("a bare yyyy-MM-dd is a calendar day, printed as the day it names", () => {
    it("formatDate shows the 16th for 2026-11-16 in Brazil, not the 15th", () => {
        expect(formatDate("2026-11-16")).toBe("16/11/2026");
    });

    it("formatDate shows the same day east of Greenwich", () => {
        inZone("Asia/Tokyo");
        expect(formatDate("2026-11-16")).toBe("16/11/2026");
    });

    it("formatDateTime keeps the day and shows midnight instead of 21:00 the day before", () => {
        expect(formatDateTime("2026-11-16")).toBe("16/11/2026, 00:00");
    });

    it("an instant with a time is still converted to the local zone", () => {
        expect(formatDate("2026-11-16T01:00:00Z")).toBe("15/11/2026");
        expect(formatDateTime("2026-11-16T01:00:00Z")).toBe("15/11/2026, 22:00");
    });

    it("a day the month does not have is invalid instead of rolling into the next month", () => {
        expect(formatDate("2026-02-30")).toBe("");
        expect(formatDateTime("2026-02-30")).toBe("");
    });

    it("createI18n().formatDate shows the day it names, with or without options", () => {
        const i18n = createI18n({ locale: "pt-BR", messages: {} });
        expect(i18n.formatDate("2026-11-16")).toBe("16/11/2026");
        expect(i18n.formatDate("2026-11-16", { weekday: "short", day: "2-digit" })).toBe(
            "seg., 16",
        );
        expect(i18n.formatDate("2026-11-01", { month: "short" })).toBe("nov.");
    });

    it("createI18n().formatDate ignores a caller timeZone that would move the day", () => {
        const i18n = createI18n({ locale: "pt-BR", messages: {} });
        expect(i18n.formatDate("2026-11-16", { timeZone: "Asia/Tokyo" })).toBe("16/11/2026");
        expect(i18n.formatDate("2026-11-16", { timeZone: "America/Sao_Paulo" })).toBe("16/11/2026");
    });

    it("createI18n().formatDate still converts an instant to the zone asked for", () => {
        const i18n = createI18n({ locale: "pt-BR", messages: {} });
        expect(i18n.formatDate("2026-11-16T01:00:00Z", { timeZone: "America/Sao_Paulo" })).toBe(
            "15/11/2026",
        );
    });
});

describe("formatTime", () => {
    it("prints an instant as HH:mm in the local zone", () => {
        expect(formatTime("2026-11-16T20:30:00Z")).toBe("17:30");
        expect(formatTime(new Date(2026, 10, 16, 8, 5))).toBe("08:05");
    });

    it("prints midnight as 00:00, not 24:00", () => {
        expect(formatTime(new Date(2026, 10, 16, 0, 0))).toBe("00:00");
    });

    it("returns a backend time-of-day as its own HH:mm, with no zone conversion", () => {
        expect(formatTime("14:30")).toBe("14:30");
        expect(formatTime("14:30:59")).toBe("14:30");
        expect(formatTime("14:30:59.123456")).toBe("14:30");
    });

    it("answers the fallback when absent", () => {
        expect(formatTime(null)).toBe("—");
        expect(formatTime(undefined, { fallback: "" })).toBe("");
    });

    it("answers empty for a present value that is not a time", () => {
        expect(formatTime("banana")).toBe("");
        expect(formatTime("25:00")).toBe("");
        expect(formatTime("10:60")).toBe("");
        expect(formatTime("2026-11-16")).toBe("");
    });
});

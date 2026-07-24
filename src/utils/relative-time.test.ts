import { describe, expect, it } from "vitest";
import { relativeTime, type RelativeTimeLocale } from "./relative-time";

const NOW = new Date("2026-05-17T12:00:00Z").getTime();
const opts = { now: NOW };

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Format an offset from the fixed `NOW`, negative for the past.
 *
 * @param offsetMs - Milliseconds relative to `NOW` (negative = past).
 * @param locale - Locale to render in. Defaults to the implicit `"pt-BR"`.
 * @returns The rendered relative-time string.
 */
function at(offsetMs: number, locale?: RelativeTimeLocale): string {
    return relativeTime(new Date(NOW + offsetMs), locale ? { ...opts, locale } : opts);
}

describe("relativeTime — past, pt-BR", () => {
    it.each([
        ["under 30s reads as just now", -5 * SECOND, "agora há pouco"],
        ["exactly 30s crosses into seconds", -30 * SECOND, "30 s atrás"],
        ["59s stays in seconds", -59 * SECOND, "59 s atrás"],
        ["one minute", -MINUTE, "1 min atrás"],
        ["59 minutes stays in minutes", -59 * MINUTE, "59 min atrás"],
        ["one hour is singular", -HOUR, "1 hora atrás"],
        ["several hours are plural", -5 * HOUR, "5 horas atrás"],
        ["one day reads as yesterday", -DAY, "ontem"],
        ["several days are plural", -3 * DAY, "3 dias atrás"],
        ["one week is 'semana passada'", -WEEK, "semana passada"],
        ["several weeks are plural", -3 * WEEK, "3 semanas atrás"],
        ["one month is 'mês passado'", -MONTH, "mês passado"],
        ["several months are plural", -2 * MONTH, "2 meses atrás"],
        ["one year is 'ano passado'", -YEAR, "ano passado"],
        ["several years are plural", -2 * YEAR, "2 anos atrás"],
    ])("%s", (_label, offset, expected) => {
        expect(at(offset as number)).toBe(expected);
    });
});

describe("relativeTime — future, pt-BR", () => {
    it.each([
        ["under 30s still reads as just now", 5 * SECOND, "agora há pouco"],
        ["seconds", 40 * SECOND, "em 40 s"],
        ["minutes", 10 * MINUTE, "em 10 min"],
        ["hours", 5 * HOUR, "em 5 h"],
        ["one day is singular", DAY, "em 1 dia"],
        ["several days are plural", 3 * DAY, "em 3 dias"],
        ["one week is singular", WEEK, "em 1 semana"],
        ["several weeks are plural", 3 * WEEK, "em 3 semanas"],
        ["one month is singular", MONTH, "em 1 mês"],
        ["several months are plural", 2 * MONTH, "em 2 meses"],
        ["one year is singular", YEAR, "em 1 ano"],
        ["several years are plural", 2 * YEAR, "em 2 anos"],
    ])("%s", (_label, offset, expected) => {
        expect(at(offset as number)).toBe(expected);
    });
});

describe("relativeTime — past, en", () => {
    it.each([
        ["just now", -5 * SECOND, "just now"],
        ["seconds", -40 * SECOND, "40s ago"],
        ["minutes", -5 * MINUTE, "5m ago"],
        ["hours", -5 * HOUR, "5h ago"],
        ["one day reads as yesterday", -DAY, "yesterday"],
        ["several days", -3 * DAY, "3 days ago"],
        ["weeks", -3 * WEEK, "3w ago"],
        ["months", -2 * MONTH, "2mo ago"],
        ["years", -2 * YEAR, "2y ago"],
    ])("%s", (_label, offset, expected) => {
        expect(at(offset as number, "en")).toBe(expected);
    });
});

describe("relativeTime — future, en", () => {
    it.each([
        ["seconds", 40 * SECOND, "in 40s"],
        ["minutes", 10 * MINUTE, "in 10m"],
        ["hours", 5 * HOUR, "in 5h"],
        ["days", 3 * DAY, "in 3d"],
        ["weeks", 3 * WEEK, "in 3w"],
        ["months", 2 * MONTH, "in 2mo"],
        ["years", 2 * YEAR, "in 2y"],
    ])("%s", (_label, offset, expected) => {
        expect(at(offset as number, "en")).toBe(expected);
    });
});

describe("relativeTime — inputs", () => {
    it("accepts ISO strings", () => {
        expect(relativeTime("2026-05-17T11:55:00Z", opts)).toBe("5 min atrás");
    });

    it("accepts timestamps", () => {
        expect(relativeTime(NOW - MINUTE, opts)).toBe("1 min atrás");
    });

    it("accepts a Date as `now`", () => {
        expect(relativeTime(NOW - 5 * MINUTE, { now: new Date(NOW) })).toBe("5 min atrás");
    });

    it("falls back to the real clock when `now` is omitted", () => {
        expect(relativeTime(new Date())).toBe("agora há pouco");
    });

    it("treats the exact same instant as just now", () => {
        expect(at(0)).toBe("agora há pouco");
    });
});

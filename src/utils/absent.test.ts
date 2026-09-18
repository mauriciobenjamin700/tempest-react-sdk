import { describe, expect, it } from "vitest";

import { ABSENT_TEXT } from "./absent";
import {
    formatCurrency,
    formatDate,
    formatDateForInput,
    formatDateTime,
    formatDateTimeForInput,
    formatPercent,
} from "./format";
import { formatBytes, formatCompactNumber } from "./numbers";

/**
 * One answer for "there is nothing to format", across every formatter.
 *
 * Measured on 0.65.0, before this change — the row is what reached the screen
 * for a column the backend left null:
 *
 * | input | currency | bytes | compact | date |
 * | --- | --- | --- | --- | --- |
 * | `null` | `"R$ 0,00"` | `"NaN undefined"` | `"0"` | throws `TypeError` |
 * | `undefined` | `"R$ NaN"` | `"NaN undefined"` | `"NaN"` | throws `TypeError` |
 *
 * The two zeroes are the reason this is a correctness fix rather than a polish
 * one: `NaN` at least looks broken, while `R$ 0,00` and `0` are numbers a reader
 * has no way to question. `Intl` coerces `null` to zero and nobody downstream
 * can tell that apart from a real zero.
 */

const READING_FORMATTERS: ReadonlyArray<[string, (value: never) => string]> = [
    ["formatCurrency", formatCurrency as (value: never) => string],
    ["formatBytes", formatBytes as (value: never) => string],
    ["formatCompactNumber", formatCompactNumber as (value: never) => string],
    ["formatPercent", formatPercent as (value: never) => string],
    ["formatDate", formatDate as (value: never) => string],
    ["formatDateTime", formatDateTime as (value: never) => string],
];

describe("absent values across the reading formatters", () => {
    it.each(READING_FORMATTERS)("%s renders an em dash for null", (_name, format) => {
        expect(format(null as never)).toBe(ABSENT_TEXT);
    });

    it.each(READING_FORMATTERS)("%s renders an em dash for undefined", (_name, format) => {
        expect(format(undefined as never)).toBe(ABSENT_TEXT);
    });

    it.each(READING_FORMATTERS)("%s never throws on an absent value", (_name, format) => {
        expect(() => format(null as never)).not.toThrow();
        expect(() => format(undefined as never)).not.toThrow();
    });
});

describe("the zeroes that used to reach the screen", () => {
    it("does not report an absent amount as R$ 0,00", () => {
        expect(formatCurrency(null)).not.toContain("0,00");
        expect(formatCurrency(0)).toContain("0,00");
    });

    it("does not report an absent count as 0", () => {
        expect(formatCompactNumber(null)).not.toBe("0");
        expect(formatCompactNumber(0)).toBe("0");
    });

    it("does not report an absent size with a unit that does not exist", () => {
        expect(formatBytes(null)).toBe(ABSENT_TEXT);
        expect(formatBytes(0)).toBe("0 B");
    });
});

/**
 * `formatBytes` and `formatCompactNumber` take their options **third**, after
 * `decimals` and `locale` — the parameters they already had. Asserting each
 * signature as it really is, rather than pretending they line up, is what keeps
 * this file from documenting an API the SDK does not have.
 */
describe("the fallback is the caller's to choose", () => {
    it("takes it second where the formatter has no other parameter", () => {
        expect(formatCurrency(null, { fallback: "sem dado" })).toBe("sem dado");
        expect(formatPercent(null, { fallback: "sem dado" })).toBe("sem dado");
        expect(formatDate(null, { fallback: "sem dado" })).toBe("sem dado");
        expect(formatDateTime(null, { fallback: "sem dado" })).toBe("sem dado");
    });

    it("takes it third where decimals or locale come first", () => {
        expect(formatBytes(null, 1, { fallback: "sem dado" })).toBe("sem dado");
        expect(formatCompactNumber(null, "pt-BR", { fallback: "sem dado" })).toBe("sem dado");
    });
});

describe("present values are untouched", () => {
    it("keeps every existing rendering", () => {
        expect(formatCurrency(1234.56)).toContain("1.234,56");
        expect(formatBytes(1536)).toBe("1.5 KB");
        expect(formatCompactNumber(1234)).toBe("1.2K");
        expect(formatPercent(0.125)).toBe("12,5%");
        expect(formatDate("2026-05-16T12:00:00Z")).toBe("16/05/2026");
        expect(formatDateTime("2026-05-16T12:00:00Z")).toContain("16/05/2026");
    });

    /**
     * Present-and-unparseable stays `""`, which is what tells "nobody filled
     * this in" apart from "what they filled in is broken" while reading a log.
     */
    it("keeps a present-but-invalid date distinguishable from an absent one", () => {
        expect(formatDate("banana")).toBe("");
        expect(formatDateTime("banana")).toBe("");
        expect(formatDate(null)).toBe(ABSENT_TEXT);
    });
});

describe("the input formatters answer with an empty string", () => {
    it.each([
        ["formatDateForInput", formatDateForInput],
        ["formatDateTimeForInput", formatDateTimeForInput],
    ] as const)("%s renders '' for an absent value", (_name, format) => {
        expect(format(null)).toBe("");
        expect(format(undefined)).toBe("");
    });

    it("still takes a custom fallback when the app wants one", () => {
        expect(formatDateForInput(null, { fallback: "—" })).toBe("—");
    });

    it("keeps formatting a present value", () => {
        expect(formatDateForInput("2026-05-16")).toBe("2026-05-16");
        expect(formatDateTimeForInput("2026-05-16T10:30")).toBe("2026-05-16T10:30");
    });
});

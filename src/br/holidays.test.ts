import { describe, expect, it } from "vitest";

import {
    addBusinessDays,
    easterSunday,
    holidaysFor,
    isBusinessDay,
    isHoliday,
    nextBusinessDay,
} from "./holidays";

/**
 * Gauss's Easter algorithm.
 *
 * A second derivation of the same date from a different set of intermediate terms
 * than the Meeus/Jones/Butcher form the SDK uses, so agreeing over a century is
 * evidence about both rather than about one.
 */
function easterGauss(year: number): string {
    const a = year % 19;
    const b = year % 4;
    const c = year % 7;
    const k = Math.floor(year / 100);
    const p = Math.floor((13 + 8 * k) / 25);
    const q = Math.floor(k / 4);
    const m = (15 - p + k - q) % 30;
    const n = (4 + k - q) % 7;
    const d = (19 * a + m) % 30;
    const e = (2 * b + 4 * c + 6 * d + n) % 7;
    if (d === 29 && e === 6) return `${year}-04-19`;
    if (d === 28 && e === 6 && a > 10) return `${year}-04-18`;
    const day = 22 + d + e;
    return day <= 31
        ? `${year}-03-${String(day).padStart(2, "0")}`
        : `${year}-04-${String(day - 31).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` of a local-midnight date, without going through UTC. */
function iso(date: Date): string {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
}

/** Published Gregorian Easter dates, as an external oracle. */
const PUBLISHED_EASTER: Record<number, string> = {
    2020: "2020-04-12",
    2021: "2021-04-04",
    2022: "2022-04-17",
    2023: "2023-04-09",
    2024: "2024-03-31",
    2025: "2025-04-20",
    2026: "2026-04-05",
    2027: "2027-03-28",
};

describe("easterSunday", () => {
    it.each(Object.entries(PUBLISHED_EASTER))("matches the published date for %s", (year, date) => {
        expect(iso(easterSunday(Number(year)))).toBe(date);
    });

    it("agrees with Gauss's algorithm for every year from 1900 to 2099", () => {
        for (let year = 1900; year <= 2099; year += 1) {
            expect(iso(easterSunday(year))).toBe(easterGauss(year));
        }
    });

    it("always lands on a Sunday", () => {
        for (let year = 2000; year <= 2050; year += 1) {
            expect(easterSunday(year).getDay()).toBe(0);
        }
    });
});

describe("holidaysFor", () => {
    it("returns the thirteen days the national financial system observes", () => {
        const holidays = holidaysFor(2026);
        expect(holidays).toHaveLength(13);
        expect(holidays.filter((holiday) => holiday.kind === "national")).toHaveLength(9);
        expect(holidays.filter((holiday) => holiday.kind === "banking")).toHaveLength(4);
    });

    it("derives the four movable days from Easter", () => {
        const byName = new Map(holidaysFor(2026).map((holiday) => [holiday.name, holiday.date]));
        expect(byName.get("Carnaval (segunda-feira)")).toBe("2026-02-16");
        expect(byName.get("Carnaval (terça-feira)")).toBe("2026-02-17");
        expect(byName.get("Sexta-feira da Paixão")).toBe("2026-04-03");
        expect(byName.get("Corpus Christi")).toBe("2026-06-04");
    });

    it("marks the movable days as banking rather than national", () => {
        for (const holiday of holidaysFor(2026).filter((entry) => entry.movable)) {
            expect(holiday.kind).toBe("banking");
        }
    });

    it("adds 20 November only from 2024, when Lei 14.759/2023 took effect", () => {
        const dates = (year: number) => holidaysFor(year).map((holiday) => holiday.date);
        expect(dates(2023)).not.toContain("2023-11-20");
        expect(dates(2024)).toContain("2024-11-20");
        expect(holidaysFor(2023)).toHaveLength(12);
    });

    it("returns the list sorted by date", () => {
        const dates = holidaysFor(2027).map((holiday) => holiday.date);
        expect(dates).toEqual([...dates].sort());
    });

    it("keeps the fixed days on their fixed dates", () => {
        const dates = holidaysFor(2030).map((holiday) => holiday.date);
        expect(dates).toContain("2030-01-01");
        expect(dates).toContain("2030-04-21");
        expect(dates).toContain("2030-05-01");
        expect(dates).toContain("2030-09-07");
        expect(dates).toContain("2030-10-12");
        expect(dates).toContain("2030-11-02");
        expect(dates).toContain("2030-11-15");
        expect(dates).toContain("2030-12-25");
    });
});

describe("isHoliday", () => {
    it("recognises a fixed national holiday", () => {
        expect(isHoliday("2026-11-20")).toBe(true);
        expect(isHoliday("2026-11-21")).toBe(false);
    });

    it("counts Carnaval by default and drops it on request", () => {
        expect(isHoliday("2026-02-17")).toBe(true);
        expect(isHoliday("2026-02-17", { kinds: ["national"] })).toBe(false);
    });

    it("accepts a Date as well as an ISO string", () => {
        expect(isHoliday(new Date(2026, 11, 25))).toBe(true);
    });

    it("does not treat a weekend as a holiday", () => {
        expect(isHoliday("2026-08-02")).toBe(false);
    });

    it("takes state and municipal days through `extra`", () => {
        expect(isHoliday("2026-07-09")).toBe(false);
        expect(isHoliday("2026-07-09", { extra: ["2026-07-09"] })).toBe(true);
        expect(isHoliday("2026-07-09", { extra: [new Date(2026, 6, 9)] })).toBe(true);
    });

    it("rejects a string that is not YYYY-MM-DD", () => {
        expect(() => isHoliday("25/12/2026")).toThrow(RangeError);
        expect(() => isHoliday("2026-1-1")).toThrow(RangeError);
    });

    it("rejects an Invalid Date", () => {
        expect(() => isHoliday(new Date("nope"))).toThrow(RangeError);
    });
});

describe("isBusinessDay", () => {
    it.each([
        ["2026-08-01", false, "Saturday"],
        ["2026-08-02", false, "Sunday"],
        ["2026-08-03", true, "Monday"],
        ["2026-04-03", false, "Sexta-feira da Paixão"],
        ["2026-12-25", false, "Natal"],
    ])("reads %s as %s (%s)", (date, expected) => {
        expect(isBusinessDay(date)).toBe(expected);
    });

    it("counts Good Friday as worked under a labour-law calendar", () => {
        expect(isBusinessDay("2026-04-03", { kinds: ["national"] })).toBe(true);
    });

    it("honours a custom weekend", () => {
        expect(isBusinessDay("2026-08-02", { weekend: [5, 6] })).toBe(true);
        expect(isBusinessDay("2026-08-03", { weekend: [1] })).toBe(false);
    });
});

describe("nextBusinessDay", () => {
    it("moves strictly forward, never returning the same day", () => {
        expect(iso(nextBusinessDay("2026-08-03"))).toBe("2026-08-04");
    });

    it("jumps a holiday and the weekend behind it", () => {
        expect(iso(nextBusinessDay("2026-12-24"))).toBe("2026-12-28");
    });

    it("jumps the whole Carnaval week", () => {
        expect(iso(nextBusinessDay("2026-02-13"))).toBe("2026-02-18");
    });

    it("keeps Carnaval a working day under a labour-law calendar", () => {
        expect(iso(nextBusinessDay("2026-02-13", { kinds: ["national"] }))).toBe("2026-02-16");
    });

    it("throws instead of looping when every day is marked off", () => {
        expect(() => nextBusinessDay("2026-08-03", { weekend: [0, 1, 2, 3, 4, 5, 6] })).toThrow(
            RangeError,
        );
    });
});

describe("addBusinessDays", () => {
    it("returns the day unchanged for zero, even when it is not a working day", () => {
        expect(iso(addBusinessDays("2026-12-25", 0))).toBe("2026-12-25");
    });

    it("skips Good Friday and the weekend after it", () => {
        expect(iso(addBusinessDays("2026-04-01", 2))).toBe("2026-04-06");
    });

    it("walks backwards for a negative count", () => {
        expect(iso(addBusinessDays("2026-04-06", -2))).toBe("2026-04-01");
    });

    it("crosses a year boundary", () => {
        expect(iso(addBusinessDays("2026-12-30", 3))).toBe("2027-01-05");
    });

    it("accepts a Date and returns a fresh one", () => {
        const input = new Date(2026, 7, 3);
        const result = addBusinessDays(input, 1);
        expect(iso(result)).toBe("2026-08-04");
        expect(iso(input)).toBe("2026-08-03");
    });

    it("throws instead of looping when every day is marked off", () => {
        expect(() => addBusinessDays("2026-08-03", 1, { weekend: [0, 1, 2, 3, 4, 5, 6] })).toThrow(
            RangeError,
        );
    });
});

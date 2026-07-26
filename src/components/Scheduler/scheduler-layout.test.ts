import { describe, expect, it } from "vitest";

import {
    addDays,
    dayRange,
    fractionOfWindow,
    hourMarks,
    isSameDay,
    layoutAllDay,
    layoutEvents,
    minutesOfDay,
    type SchedulerEvent,
    startOfDay,
} from "./scheduler-layout";

/** 2026-07-27 is a Monday. */
const MONDAY = new Date(2026, 6, 27);
const WINDOW = { startMinute: 8 * 60, endMinute: 20 * 60 };

/** An event on `MONDAY` from `fromHour` to `toHour`, local time. */
function at(id: string, fromHour: number, toHour: number, dayOffset = 0): SchedulerEvent {
    const day = addDays(MONDAY, dayOffset);
    return {
        id,
        title: id,
        start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), fromHour, 0),
        end: new Date(day.getFullYear(), day.getMonth(), day.getDate(), toHour, 0),
    };
}

const days = (count: number) => dayRange(MONDAY, count);

/** Column assignment for one day, keyed by event id. */
function columnsOf(events: SchedulerEvent[], count = 1) {
    const placed = layoutEvents({ events, days: days(count), window: WINDOW });
    return Object.fromEntries(
        placed.map((p) => [p.event.id, { column: p.column, columns: p.columns }]),
    );
}

describe("date helpers", () => {
    it("reads minutes from midnight in local time", () => {
        expect(minutesOfDay(new Date(2026, 6, 27, 9, 30))).toBe(570);
    });

    it("zeroes the time for startOfDay", () => {
        const d = startOfDay(new Date(2026, 6, 27, 15, 42, 9, 500));
        expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([
            0, 0, 0, 0,
        ]);
    });

    it("compares calendar days, not instants", () => {
        expect(isSameDay(new Date(2026, 6, 27, 0, 1), new Date(2026, 6, 27, 23, 59))).toBe(true);
        expect(isSameDay(new Date(2026, 6, 27, 23, 59), new Date(2026, 6, 28, 0, 1))).toBe(false);
    });

    it("increments the calendar day rather than adding 24 hours", () => {
        // Month and year rollovers are where millisecond arithmetic drifts.
        expect(addDays(new Date(2026, 0, 31), 1).getMonth()).toBe(1);
        expect(addDays(new Date(2026, 11, 31), 1).getFullYear()).toBe(2027);
    });

    it("produces consecutive midnights", () => {
        const range = dayRange(new Date(2026, 6, 27, 13, 0), 7);
        expect(range).toHaveLength(7);
        expect(range.map((d) => d.getDate())).toEqual([27, 28, 29, 30, 31, 1, 2]);
        expect(range.every((d) => d.getHours() === 0)).toBe(true);
    });

    it("returns nothing for a non-positive count", () => {
        expect(dayRange(MONDAY, 0)).toEqual([]);
        expect(dayRange(MONDAY, -3)).toEqual([]);
    });
});

describe("layoutEvents — vertical placement", () => {
    it("positions an event as a fraction of the visible window", () => {
        const [placed] = layoutEvents({ events: [at("a", 8, 9)], days: days(1), window: WINDOW });
        expect(placed.top).toBe(0);
        expect(placed.height).toBeCloseTo(1 / 12, 6);
    });

    it("places an event in the middle of the window", () => {
        const [placed] = layoutEvents({ events: [at("a", 14, 15)], days: days(1), window: WINDOW });
        expect(placed.top).toBeCloseTo(0.5, 6);
    });

    it("clips an event that starts before the window", () => {
        const [placed] = layoutEvents({ events: [at("a", 6, 9)], days: days(1), window: WINDOW });
        expect(placed.top).toBe(0);
        expect(placed.height).toBeCloseTo(1 / 12, 6);
    });

    it("clips an event that runs past the window", () => {
        const [placed] = layoutEvents({ events: [at("a", 19, 23)], days: days(1), window: WINDOW });
        expect(placed.top + placed.height).toBeCloseTo(1, 6);
    });

    it("drops an event entirely outside the window", () => {
        expect(layoutEvents({ events: [at("a", 5, 7)], days: days(1), window: WINDOW })).toEqual(
            [],
        );
    });

    it("drops a zero-length or inverted event", () => {
        expect(layoutEvents({ events: [at("a", 10, 10)], days: days(1), window: WINDOW })).toEqual(
            [],
        );
        expect(layoutEvents({ events: [at("a", 12, 10)], days: days(1), window: WINDOW })).toEqual(
            [],
        );
    });

    it("ignores all-day events — a vertical position would be meaningless", () => {
        const allDay: SchedulerEvent = { ...at("a", 8, 9), allDay: true };
        expect(layoutEvents({ events: [allDay], days: days(1), window: WINDOW })).toEqual([]);
    });

    it("returns nothing for an empty or inverted window", () => {
        expect(
            layoutEvents({
                events: [at("a", 9, 10)],
                days: days(1),
                window: { startMinute: 600, endMinute: 600 },
            }),
        ).toEqual([]);
    });
});

describe("layoutEvents — days", () => {
    it("places each event in its own day column", () => {
        const placed = layoutEvents({
            events: [at("mon", 9, 10), at("wed", 9, 10, 2)],
            days: days(7),
            window: WINDOW,
        });
        expect(placed.find((p) => p.event.id === "mon")?.dayIndex).toBe(0);
        expect(placed.find((p) => p.event.id === "wed")?.dayIndex).toBe(2);
    });

    it("splits an event crossing midnight into both day columns", () => {
        const overnight: SchedulerEvent = {
            id: "night",
            title: "night",
            start: new Date(2026, 6, 27, 23, 0),
            end: new Date(2026, 6, 28, 1, 0),
        };
        const placed = layoutEvents({
            events: [overnight],
            days: days(2),
            window: { startMinute: 0, endMinute: 24 * 60 },
        });
        expect(placed.map((p) => p.dayIndex).sort()).toEqual([0, 1]);
        // First piece runs to the end of its day, second starts at its beginning.
        const first = placed.find((p) => p.dayIndex === 0)!;
        const second = placed.find((p) => p.dayIndex === 1)!;
        expect(first.top + first.height).toBeCloseTo(1, 6);
        expect(second.top).toBe(0);
    });

    it("ignores an event outside the rendered range", () => {
        expect(
            layoutEvents({ events: [at("far", 9, 10, 10)], days: days(7), window: WINDOW }),
        ).toEqual([]);
    });

    it("returns nothing when no days are rendered", () => {
        expect(layoutEvents({ events: [at("a", 9, 10)], days: [], window: WINDOW })).toEqual([]);
    });
});

describe("layoutEvents — overlap columns", () => {
    it("gives a lone event the full width", () => {
        expect(columnsOf([at("a", 9, 10)])).toEqual({ a: { column: 0, columns: 1 } });
    });

    it("splits two overlapping events into two columns", () => {
        expect(columnsOf([at("a", 9, 11), at("b", 10, 12)])).toEqual({
            a: { column: 0, columns: 2 },
            b: { column: 1, columns: 2 },
        });
    });

    it("keeps back-to-back events at full width — touching is not overlapping", () => {
        expect(columnsOf([at("a", 9, 10), at("b", 10, 11)])).toEqual({
            a: { column: 0, columns: 1 },
            b: { column: 0, columns: 1 },
        });
    });

    it("reuses a freed column instead of widening the cluster", () => {
        // a and b overlap; c starts after a ends, so it takes a's column back.
        const result = columnsOf([at("a", 9, 10), at("b", 9, 12), at("c", 10, 11)]);
        expect(result.a.columns).toBe(2);
        expect(result.c.column).toBe(0);
        expect(result.c.columns).toBe(2);
    });

    it("gives every event in a chained cluster the same width", () => {
        // a–b overlap, b–c overlap, a–c do not: still one cluster, so one width.
        const result = columnsOf([at("a", 9, 11), at("b", 10, 13), at("c", 12, 14)]);
        expect(new Set(Object.values(result).map((r) => r.columns))).toEqual(new Set([2]));
    });

    it("handles three mutually overlapping events", () => {
        const result = columnsOf([at("a", 9, 12), at("b", 9, 12), at("c", 9, 12)]);
        expect(Object.values(result).map((r) => r.columns)).toEqual([3, 3, 3]);
        expect(new Set(Object.values(result).map((r) => r.column))).toEqual(new Set([0, 1, 2]));
    });

    it("keeps separate clusters independent", () => {
        const result = columnsOf([at("a", 9, 11), at("b", 10, 12), at("c", 15, 16)]);
        expect(result.a.columns).toBe(2);
        expect(result.c.columns).toBe(1);
    });

    it("is order-independent", () => {
        const forward = columnsOf([at("a", 9, 11), at("b", 10, 12)]);
        const backward = columnsOf([at("b", 10, 12), at("a", 9, 11)]);
        expect(forward).toEqual(backward);
    });

    it("does not let events on different days share a cluster", () => {
        const result = columnsOf([at("a", 9, 11), at("b", 9, 11, 1)], 2);
        expect(result.a.columns).toBe(1);
        expect(result.b.columns).toBe(1);
    });
});

describe("layoutAllDay", () => {
    const allDay = (id: string, fromOffset: number, toOffset: number): SchedulerEvent => ({
        id,
        title: id,
        start: addDays(MONDAY, fromOffset),
        end: addDays(MONDAY, toOffset),
        allDay: true,
    });

    it("places a single-day event on its own day", () => {
        expect(layoutAllDay({ events: [allDay("a", 2, 3)], days: days(7) })).toEqual([
            { event: expect.objectContaining({ id: "a" }), dayIndex: 2, span: 1 },
        ]);
    });

    it("spans a multi-day event across its days", () => {
        const [placed] = layoutAllDay({ events: [allDay("a", 1, 4)], days: days(7) });
        expect([placed.dayIndex, placed.span]).toEqual([1, 3]);
    });

    it("clips an event that starts before the range", () => {
        const [placed] = layoutAllDay({ events: [allDay("a", -3, 2)], days: days(7) });
        expect([placed.dayIndex, placed.span]).toEqual([0, 2]);
    });

    it("clips an event that runs past the range", () => {
        const [placed] = layoutAllDay({ events: [allDay("a", 5, 20)], days: days(7) });
        expect(placed.dayIndex).toBe(5);
        expect(placed.span).toBe(2);
    });

    it("ignores timed events and events outside the range", () => {
        expect(
            layoutAllDay({ events: [at("timed", 9, 10), allDay("far", 30, 31)], days: days(7) }),
        ).toEqual([]);
    });

    it("returns nothing when no days are rendered", () => {
        expect(layoutAllDay({ events: [allDay("a", 0, 1)], days: [] })).toEqual([]);
    });
});

describe("hourMarks", () => {
    it("lists whole hours inside the window", () => {
        expect(hourMarks({ startMinute: 8 * 60, endMinute: 11 * 60 })).toEqual([
            480, 540, 600, 660,
        ]);
    });

    it("starts at the first whole hour after a partial start", () => {
        expect(hourMarks({ startMinute: 8 * 60 + 30, endMinute: 10 * 60 })).toEqual([540, 600]);
    });

    it("returns nothing for an inverted window", () => {
        expect(hourMarks({ startMinute: 600, endMinute: 300 })).toEqual([]);
    });
});

describe("fractionOfWindow", () => {
    it("maps an instant inside the window", () => {
        expect(fractionOfWindow(new Date(2026, 6, 27, 14, 0), WINDOW)).toBeCloseTo(0.5, 6);
    });

    it("returns null outside the window, so no indicator is drawn", () => {
        expect(fractionOfWindow(new Date(2026, 6, 27, 7, 0), WINDOW)).toBeNull();
        expect(fractionOfWindow(new Date(2026, 6, 27, 21, 0), WINDOW)).toBeNull();
    });

    it("returns null for an empty window instead of dividing by zero", () => {
        expect(
            fractionOfWindow(new Date(2026, 6, 27, 10, 0), { startMinute: 600, endMinute: 600 }),
        ).toBeNull();
    });
});

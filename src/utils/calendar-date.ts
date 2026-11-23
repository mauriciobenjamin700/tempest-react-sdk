/** A bare `yyyy-MM-dd`, the shape a backend sends for a `date` column. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A date value read for display, and whether it names a calendar day. */
export interface DisplayDate {
    /** The instant to format; possibly invalid. */
    date: Date;
    /**
     * `true` when the input was a bare `yyyy-MM-dd`. The date then sits at UTC
     * midnight and must be formatted with `timeZone: "UTC"`.
     */
    calendarDay: boolean;
}

/**
 * Read a formatter's input, keeping a bare `yyyy-MM-dd` on the day it names.
 *
 * `new Date("2026-11-16")` is **UTC** midnight, so formatted in any zone west of
 * Greenwich — all of Brazil — it reads as the 15th. A date without a time is a
 * calendar day, not an instant: it is built at UTC midnight here and the caller
 * formats it in UTC, which prints the same day in every zone. Building it at
 * *local* midnight instead would be right only while the formatter uses the
 * runtime zone; a caller that passes its own `timeZone` east of UTC would move
 * it back a day again.
 *
 * A day the month does not have (`"2026-02-30"`) is invalid here, where
 * `new Date` silently rolls it into March.
 *
 * A string with a time (`…T…`, with or without an offset) and a `Date` pass
 * through unchanged: those are instants, and the runtime zone is the right one
 * to show them in.
 *
 * @param value - An ISO string or a `Date`.
 * @returns The date to format and whether it is a calendar day.
 */
export function readDisplayDate(value: string | Date): DisplayDate {
    if (typeof value !== "string") return { date: value, calendarDay: false };
    const match = DATE_ONLY.exec(value);
    if (!match) return { date: new Date(value), calendarDay: false };
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(0);
    date.setUTCFullYear(year, month, day);
    const exists = date.getUTCMonth() === month && date.getUTCDate() === day;
    return { date: exists ? date : new Date(Number.NaN), calendarDay: true };
}

/**
 * The `Intl.DateTimeFormat` options that print a {@link readDisplayDate} result.
 *
 * @param display - What {@link readDisplayDate} returned.
 * @param options - The caller's options.
 * @returns The caller's options, with `timeZone: "UTC"` forced for a calendar day.
 */
export function displayDateOptions(
    display: DisplayDate,
    options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions | undefined {
    return display.calendarDay ? { ...options, timeZone: "UTC" } : options;
}

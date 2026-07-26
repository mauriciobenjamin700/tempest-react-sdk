/** An event on the schedule. `start`/`end` are absolute instants in local time. */
export interface SchedulerEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    /** Render across the all-day lane instead of the time grid. */
    allDay?: boolean;
    /** Free-form payload the app passes through. */
    data?: Record<string, unknown>;
}

/** An event placed in the grid: which day, where vertically, which column. */
export interface PlacedEvent {
    event: SchedulerEvent;
    /** Index into the rendered day list. */
    dayIndex: number;
    /** Distance from the top of the day column, as a fraction of its height. */
    top: number;
    /** Height as a fraction of the day column. */
    height: number;
    /** Column this event occupies among its overlapping cluster, zero-based. */
    column: number;
    /** How many columns the cluster was split into. */
    columns: number;
}

/** The visible time window of a day, in minutes from midnight. */
export interface DayWindow {
    startMinute: number;
    endMinute: number;
}

/** Minutes from midnight, in local time. */
export function minutesOfDay(date: Date): number {
    return date.getHours() * 60 + date.getMinutes();
}

/** Midnight local time on the same calendar day as `date`. */
export function startOfDay(date: Date): Date {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

/** `date` shifted by whole days, preserving local wall-clock time. */
export function addDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

/** Whether two dates fall on the same local calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

/**
 * The consecutive local days a schedule should render.
 *
 * Built by incrementing the calendar day rather than adding 24 h of milliseconds:
 * across a DST boundary a day is 23 or 25 hours long, and millisecond arithmetic
 * would silently produce a duplicated or skipped date.
 *
 * @param anchor - Any instant within the first day.
 * @param count - How many days to produce.
 * @returns Midnight of each day, in order.
 */
export function dayRange(anchor: Date, count: number): Date[] {
    const first = startOfDay(anchor);
    return Array.from({ length: Math.max(0, count) }, (_, index) => addDays(first, index));
}

/**
 * Split an event into one segment per day it touches, clipped to the window.
 *
 * An event that crosses midnight has to appear in both columns, and each piece has
 * to be clipped to that day's visible window — otherwise a 23:00–01:00 booking
 * either vanishes or is drawn far outside its column.
 *
 * @param event - The event to place.
 * @param days - Midnight of each rendered day.
 * @param window - Visible minute range shared by every day.
 * @returns One entry per day the event is visible on.
 */
function segmentsFor(
    event: SchedulerEvent,
    days: Date[],
    window: DayWindow,
): { dayIndex: number; from: number; to: number }[] {
    const out: { dayIndex: number; from: number; to: number }[] = [];
    days.forEach((day, dayIndex) => {
        const dayStart = day.getTime();
        const dayEnd = addDays(day, 1).getTime();
        if (event.end.getTime() <= dayStart || event.start.getTime() >= dayEnd) return;

        const from = event.start.getTime() <= dayStart ? 0 : minutesOfDay(event.start);
        const to =
            event.end.getTime() >= dayEnd
                ? 24 * 60
                : minutesOfDay(event.end) || (event.end.getTime() > dayStart ? 24 * 60 : 0);

        const clippedFrom = Math.max(window.startMinute, from);
        const clippedTo = Math.min(window.endMinute, to);
        if (clippedTo <= clippedFrom) return;
        out.push({ dayIndex, from: clippedFrom, to: clippedTo });
    });
    return out;
}

/**
 * Assign columns so overlapping events sit side by side instead of on top.
 *
 * Events are grouped into *clusters* of mutual overlap — a chain where each event
 * overlaps at least one other — and every event in a cluster is given the same
 * column count. That shared count is what makes the widths line up; assigning
 * columns per pair instead produces the ragged layout where two events claim half
 * the width and a third silently covers one of them.
 *
 * A column is reused as soon as it is free, so `9–10`, `9–10`, `10–11` needs two
 * columns rather than three.
 *
 * @param segments - Same-day segments, in any order.
 * @returns The same segments with `column` and `columns` filled in.
 */
function assignColumns<T extends { from: number; to: number }>(
    segments: T[],
): (T & { column: number; columns: number })[] {
    const sorted = [...segments].sort((a, b) => a.from - b.from || a.to - b.to);
    const placed: (T & { column: number; columns: number })[] = [];

    let cluster: (T & { column: number; columns: number })[] = [];
    let clusterEnd = -Infinity;

    /** Freeze the current cluster: everyone in it shares its column count. */
    const closeCluster = (): void => {
        const width = cluster.reduce((max, item) => Math.max(max, item.column + 1), 0);
        for (const item of cluster) item.columns = width;
        placed.push(...cluster);
        cluster = [];
        clusterEnd = -Infinity;
    };

    for (const segment of sorted) {
        if (segment.from >= clusterEnd) closeCluster();

        // Lowest column whose last event has already ended.
        const taken = new Set(
            cluster.filter((item) => item.to > segment.from).map((i) => i.column),
        );
        let column = 0;
        while (taken.has(column)) column += 1;

        cluster.push({ ...segment, column, columns: 1 });
        clusterEnd = Math.max(clusterEnd, segment.to);
    }
    closeCluster();

    return placed;
}

/**
 * Lay out timed events across the rendered days.
 *
 * All-day events are excluded — they belong in their own lane, where a vertical
 * position would be meaningless.
 *
 * @param params.events - Every event, all-day ones included.
 * @param params.days - Midnight of each rendered day.
 * @param params.window - Visible minute range.
 * @returns Placed events, positioned as fractions of the column height.
 */
export function layoutEvents({
    events,
    days,
    window,
}: {
    events: readonly SchedulerEvent[];
    days: Date[];
    window: DayWindow;
}): PlacedEvent[] {
    const span = window.endMinute - window.startMinute;
    if (span <= 0 || days.length === 0) return [];

    const byDay = new Map<number, { event: SchedulerEvent; from: number; to: number }[]>();
    for (const event of events) {
        if (event.allDay) continue;
        if (event.end.getTime() <= event.start.getTime()) continue;
        for (const segment of segmentsFor(event, days, window)) {
            const list = byDay.get(segment.dayIndex) ?? [];
            list.push({ event, from: segment.from, to: segment.to });
            byDay.set(segment.dayIndex, list);
        }
    }

    const placed: PlacedEvent[] = [];
    for (const [dayIndex, segments] of byDay) {
        for (const item of assignColumns(segments)) {
            placed.push({
                event: item.event,
                dayIndex,
                top: (item.from - window.startMinute) / span,
                height: (item.to - item.from) / span,
                column: item.column,
                columns: item.columns,
            });
        }
    }
    return placed;
}

/**
 * All-day events that intersect the rendered range, with their day span.
 *
 * @param params.events - Every event.
 * @param params.days - Midnight of each rendered day.
 * @returns One entry per all-day event, clipped to the visible days.
 */
export function layoutAllDay({
    events,
    days,
}: {
    events: readonly SchedulerEvent[];
    days: Date[];
}): { event: SchedulerEvent; dayIndex: number; span: number }[] {
    if (days.length === 0) return [];
    const rangeEnd = addDays(days[days.length - 1], 1).getTime();

    return events
        .filter((event) => event.allDay)
        .filter(
            (event) => event.end.getTime() > days[0].getTime() && event.start.getTime() < rangeEnd,
        )
        .map((event) => {
            const firstIndex = days.findIndex(
                (day) => addDays(day, 1).getTime() > event.start.getTime(),
            );
            const lastIndex = days.reduce(
                (last, day, index) => (day.getTime() < event.end.getTime() ? index : last),
                0,
            );
            const dayIndex = Math.max(0, firstIndex);
            return { event, dayIndex, span: Math.max(1, lastIndex - dayIndex + 1) };
        });
}

/**
 * Hour marks to label the time gutter with.
 *
 * @param window - Visible minute range.
 * @returns Each whole hour inside the window, in minutes from midnight.
 */
export function hourMarks(window: DayWindow): number[] {
    const first = Math.ceil(window.startMinute / 60);
    const last = Math.floor(window.endMinute / 60);
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => (first + i) * 60);
}

/**
 * Where an instant falls within the window, as a fraction of the column height.
 *
 * @param date - The instant.
 * @param window - Visible minute range.
 * @returns A fraction in `0…1`, or `null` when outside the window.
 */
export function fractionOfWindow(date: Date, window: DayWindow): number | null {
    const minute = minutesOfDay(date);
    const span = window.endMinute - window.startMinute;
    if (span <= 0 || minute < window.startMinute || minute > window.endMinute) return null;
    return (minute - window.startMinute) / span;
}

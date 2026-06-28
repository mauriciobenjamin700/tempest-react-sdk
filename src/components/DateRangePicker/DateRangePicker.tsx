import { useCallback, useMemo, useState } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import styles from "./DateRangePicker.module.css";

export type WeekStart = 0 | 1;

/** A selected range. Either bound may be `null` while picking. */
export interface DateRange {
    start: Date | null;
    end: Date | null;
}

export interface DateRangePickerProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    "onChange" | "defaultValue"
> {
    /** Controlled selected range. */
    value: DateRange;
    /** Called with the new range as the user picks start then end. */
    onChange: (range: DateRange) => void;
    /** How many month grids to show side by side. Default `2`. */
    numberOfMonths?: number;
    /** Initial visible month (uncontrolled). Defaults to the range start or today. */
    defaultMonth?: Date;
    minDate?: Date;
    maxDate?: Date;
    /** First column of the week — `0` Sunday (default) or `1` Monday. */
    weekStartsOn?: WeekStart;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
const DAYS_IN_GRID = 42;

function makeDate(year: number, month: number, day: number): Date {
    return new Date(year, month, day);
}

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonths(date: Date, offset: number): Date {
    return makeDate(date.getFullYear(), date.getMonth() + offset, 1);
}

function isSameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function isOutOfRange(date: Date, minDate?: Date, maxDate?: Date): boolean {
    const day = startOfDay(date).getTime();
    if (minDate && day < startOfDay(minDate).getTime()) return true;
    if (maxDate && day > startOfDay(maxDate).getTime()) return true;
    return false;
}

/** Inclusive-exclusive-agnostic "strictly between a and b" (a/b order-independent). */
function isBetween(date: Date, a: Date, b: Date): boolean {
    const t = startOfDay(date).getTime();
    const lo = Math.min(startOfDay(a).getTime(), startOfDay(b).getTime());
    const hi = Math.max(startOfDay(a).getTime(), startOfDay(b).getTime());
    return t > lo && t < hi;
}

function buildGrid(month: Date, weekStartsOn: WeekStart): Date[] {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstWeekday = makeDate(year, monthIndex, 1).getDay();
    const leading = (firstWeekday - weekStartsOn + 7) % 7;
    const start = makeDate(year, monthIndex, 1 - leading);
    return Array.from({ length: DAYS_IN_GRID }, (_, i) =>
        makeDate(start.getFullYear(), start.getMonth(), start.getDate() + i),
    );
}

/**
 * Date-range picker: pick a start day, then an end day, across one or more
 * month grids. The hovered day previews the range before the end is committed.
 * Pure `Date` math — no date libraries. For a single date, use `Calendar`.
 *
 * Selection: first click sets `start` (clears `end`); the next click sets `end`
 * (auto-ordered if you click earlier than the start); a third click starts over.
 */
export function DateRangePicker({
    value,
    onChange,
    numberOfMonths = 2,
    defaultMonth,
    minDate,
    maxDate,
    weekStartsOn = 0,
    className,
    ...props
}: DateRangePickerProps) {
    const [visibleMonth, setVisibleMonth] = useState<Date>(() => {
        const base = defaultMonth ?? value.start ?? new Date();
        return makeDate(base.getFullYear(), base.getMonth(), 1);
    });
    const [hovered, setHovered] = useState<Date | null>(null);

    const today = useMemo(() => startOfDay(new Date()), []);
    const weekdayLabels = useMemo(
        () => Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(i + weekStartsOn) % 7]),
        [weekStartsOn],
    );

    const selectDate = useCallback(
        (date: Date): void => {
            if (isOutOfRange(date, minDate, maxDate)) return;
            const { start, end } = value;
            if (!start || end) {
                onChange({ start: date, end: null });
            } else if (startOfDay(date).getTime() < startOfDay(start).getTime()) {
                onChange({ start: date, end: start });
            } else {
                onChange({ start, end: date });
            }
        },
        [value, onChange, minDate, maxDate],
    );

    const changeMonth = useCallback((offset: number): void => {
        setVisibleMonth((current) => addMonths(current, offset));
    }, []);

    // Effective end used for preview highlighting (hovered day while picking).
    const previewEnd = value.start && !value.end ? hovered : value.end;

    function dayState(date: Date): {
        selected: boolean;
        inRange: boolean;
        isStart: boolean;
        isEnd: boolean;
    } {
        const { start } = value;
        const end = previewEnd;
        const isStart = start ? isSameDay(date, start) : false;
        const isEnd = end ? isSameDay(date, end) : false;
        const inRange = start && end ? isBetween(date, start, end) : false;
        return { selected: isStart || isEnd, inRange, isStart, isEnd };
    }

    return (
        <div className={cn(styles.root, className)} {...props}>
            <div className={styles.header}>
                <button
                    type="button"
                    className={styles.nav}
                    aria-label="Previous month"
                    onClick={() => changeMonth(-1)}
                >
                    {"‹"}
                </button>
                <span className={styles.headerSpacer} aria-hidden />
                <button
                    type="button"
                    className={styles.nav}
                    aria-label="Next month"
                    onClick={() => changeMonth(1)}
                >
                    {"›"}
                </button>
            </div>

            <div className={styles.months} onMouseLeave={() => setHovered(null)}>
                {Array.from({ length: Math.max(1, numberOfMonths) }, (_, monthOffset) => {
                    const month = addMonths(visibleMonth, monthOffset);
                    const cells = buildGrid(month, weekStartsOn);
                    return (
                        <div key={monthOffset} className={styles.month}>
                            <div className={styles.title} aria-live="polite">
                                {MONTH_LABELS[month.getMonth()]} {month.getFullYear()}
                            </div>
                            <div className={styles.weekdays} role="row">
                                {weekdayLabels.map((label) => (
                                    <span
                                        key={label}
                                        className={styles.weekday}
                                        role="columnheader"
                                    >
                                        {label}
                                    </span>
                                ))}
                            </div>
                            <div className={styles.grid} role="grid">
                                {cells.map((date, index) => {
                                    const inMonth = date.getMonth() === month.getMonth();
                                    const disabled = isOutOfRange(date, minDate, maxDate);
                                    const { selected, inRange, isStart, isEnd } = dayState(date);
                                    const isToday = isSameDay(date, today);
                                    return (
                                        <button
                                            key={index}
                                            type="button"
                                            role="gridcell"
                                            className={cn(
                                                styles.day,
                                                !inMonth && styles.outside,
                                                inRange && styles.inRange,
                                                selected && styles.selected,
                                                isStart && styles.rangeStart,
                                                isEnd && styles.rangeEnd,
                                                isToday && styles.today,
                                            )}
                                            aria-label={`${MONTH_LABELS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`}
                                            aria-selected={selected}
                                            aria-current={isToday ? "date" : undefined}
                                            disabled={disabled}
                                            onClick={() => selectDate(date)}
                                            onMouseEnter={() => setHovered(date)}
                                        >
                                            {date.getDate()}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

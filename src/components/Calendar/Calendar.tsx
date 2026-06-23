import { useCallback, useMemo, useRef, useState } from "react";
import type { HTMLAttributes, KeyboardEvent } from "react";
import { cn } from "@/utils/cn";
import styles from "./Calendar.module.css";

export type WeekStart = 0 | 1;

export interface CalendarProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    "onChange" | "defaultValue"
> {
    /** Controlled selected date. */
    value?: Date;
    /** Initial selected date for the uncontrolled case. */
    defaultValue?: Date;
    /** Called with the newly selected date. */
    onChange?: (date: Date) => void;
    /** Controlled visible month (any day within it). */
    month?: Date;
    /** Called when the visible month changes (prev/next). */
    onMonthChange?: (month: Date) => void;
    /** Earliest selectable date (inclusive). */
    minDate?: Date;
    /** Latest selectable date (inclusive). */
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

/**
 * Build a `Date` at midnight local time for the given year/month/day.
 *
 * @param year - Full year.
 * @param month - Zero-based month index.
 * @param day - Day of the month.
 * @returns A normalized `Date`.
 */
function makeDate(year: number, month: number, day: number): Date {
    return new Date(year, month, day);
}

/**
 * Strip the time portion so two dates can be compared by calendar day.
 *
 * @param date - The date to normalize.
 * @returns A new `Date` at local midnight.
 */
function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Whether two dates fall on the same calendar day.
 *
 * @param a - First date.
 * @param b - Second date.
 * @returns `true` when year, month and day match.
 */
function isSameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

/**
 * Whether a date is outside the inclusive `[minDate, maxDate]` window.
 *
 * @param date - The candidate day.
 * @param minDate - Optional lower bound.
 * @param maxDate - Optional upper bound.
 * @returns `true` when the date is disabled.
 */
function isOutOfRange(date: Date, minDate?: Date, maxDate?: Date): boolean {
    const day = startOfDay(date).getTime();
    if (minDate && day < startOfDay(minDate).getTime()) return true;
    if (maxDate && day > startOfDay(maxDate).getTime()) return true;
    return false;
}

/**
 * Compute the 42-cell (6x7) grid of dates covering the given month, padded with
 * leading/trailing days from the adjacent months.
 *
 * @param month - Any date within the target month.
 * @param weekStartsOn - First column of the week.
 * @returns An array of 42 `Date` objects.
 */
function buildGrid(month: Date, weekStartsOn: WeekStart): Date[] {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstOfMonth = makeDate(year, monthIndex, 1);
    const firstWeekday = firstOfMonth.getDay();
    const leading = (firstWeekday - weekStartsOn + 7) % 7;
    const start = makeDate(year, monthIndex, 1 - leading);

    const cells: Date[] = [];
    for (let i = 0; i < DAYS_IN_GRID; i += 1) {
        cells.push(makeDate(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    return cells;
}

/**
 * Standalone month-grid date picker. Renders a header with the month/year and
 * prev/next buttons, a weekday row, and a 6x7 grid of day buttons. Selection and
 * the visible month can each be controlled or uncontrolled. Grid arithmetic uses
 * plain `Date` math — no external date libraries.
 *
 * Keyboard: arrow keys move focus by day (left/right) or week (up/down), and
 * Enter/Space selects the focused day.
 */
export function Calendar({
    value,
    defaultValue,
    onChange,
    month,
    onMonthChange,
    minDate,
    maxDate,
    weekStartsOn = 0,
    className,
    ...props
}: CalendarProps) {
    const isSelectionControlled = value !== undefined;
    const [internalSelected, setInternalSelected] = useState<Date | undefined>(defaultValue);
    const selected = isSelectionControlled ? value : internalSelected;

    const isMonthControlled = month !== undefined;
    const [internalMonth, setInternalMonth] = useState<Date>(() => {
        const base = month ?? value ?? defaultValue ?? new Date();
        return makeDate(base.getFullYear(), base.getMonth(), 1);
    });
    const visibleMonth = isMonthControlled
        ? makeDate(month.getFullYear(), month.getMonth(), 1)
        : internalMonth;

    const [focusedDay, setFocusedDay] = useState<number | null>(null);
    const gridRef = useRef<HTMLDivElement | null>(null);

    const today = useMemo(() => startOfDay(new Date()), []);
    const cells = useMemo(
        () => buildGrid(visibleMonth, weekStartsOn),
        [visibleMonth, weekStartsOn],
    );

    const weekdayLabels = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(i + weekStartsOn) % 7]);
    }, [weekStartsOn]);

    const changeMonth = useCallback(
        (offset: number): void => {
            const next = makeDate(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
            if (onMonthChange) onMonthChange(next);
            if (!isMonthControlled) setInternalMonth(next);
        },
        [visibleMonth, onMonthChange, isMonthControlled],
    );

    const selectDate = useCallback(
        (date: Date): void => {
            if (isOutOfRange(date, minDate, maxDate)) return;
            if (onChange) onChange(date);
            if (!isSelectionControlled) setInternalSelected(date);
        },
        [minDate, maxDate, onChange, isSelectionControlled],
    );

    const focusCell = useCallback((index: number): void => {
        const clamped = Math.max(0, Math.min(DAYS_IN_GRID - 1, index));
        setFocusedDay(clamped);
        const grid = gridRef.current;
        if (!grid) return;
        const buttons = grid.querySelectorAll<HTMLButtonElement>("button[data-day]");
        buttons[clamped]?.focus();
    }, []);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
            switch (event.key) {
                case "ArrowLeft":
                    event.preventDefault();
                    focusCell(index - 1);
                    break;
                case "ArrowRight":
                    event.preventDefault();
                    focusCell(index + 1);
                    break;
                case "ArrowUp":
                    event.preventDefault();
                    focusCell(index - 7);
                    break;
                case "ArrowDown":
                    event.preventDefault();
                    focusCell(index + 7);
                    break;
                case "Enter":
                case " ":
                    event.preventDefault();
                    selectDate(cells[index]);
                    break;
                default:
                    break;
            }
        },
        [focusCell, selectDate, cells],
    );

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
                <span className={styles.title} aria-live="polite">
                    {MONTH_LABELS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
                </span>
                <button
                    type="button"
                    className={styles.nav}
                    aria-label="Next month"
                    onClick={() => changeMonth(1)}
                >
                    {"›"}
                </button>
            </div>

            <div className={styles.weekdays} role="row">
                {weekdayLabels.map((label) => (
                    <span key={label} className={styles.weekday} role="columnheader">
                        {label}
                    </span>
                ))}
            </div>

            <div className={styles.grid} role="grid" ref={gridRef}>
                {cells.map((date, index) => {
                    const inMonth = date.getMonth() === visibleMonth.getMonth();
                    const isSelected = selected ? isSameDay(date, selected) : false;
                    const isToday = isSameDay(date, today);
                    const disabled = isOutOfRange(date, minDate, maxDate);
                    const isFocusTarget =
                        focusedDay === null
                            ? inMonth && date.getDate() === 1
                            : focusedDay === index;
                    return (
                        <button
                            key={index}
                            type="button"
                            data-day
                            role="gridcell"
                            className={cn(
                                styles.day,
                                !inMonth && styles.outside,
                                isSelected && styles.selected,
                                isToday && styles.today,
                            )}
                            aria-pressed={isSelected}
                            aria-selected={isSelected}
                            aria-current={isToday ? "date" : undefined}
                            disabled={disabled}
                            tabIndex={isFocusTarget ? 0 : -1}
                            onClick={() => selectDate(date)}
                            onKeyDown={(event) => handleKeyDown(event, index)}
                        >
                            {date.getDate()}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

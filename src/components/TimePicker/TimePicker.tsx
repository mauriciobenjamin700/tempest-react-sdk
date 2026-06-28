import { useId, useMemo } from "react";
import { cn } from "@/utils/cn";
import styles from "./TimePicker.module.css";

export interface TimePickerProps {
    /** Selected time as a 24h `"HH:MM"` string (e.g. `"14:30"`). May be `""` for none. */
    value: string;
    /** Fired with the new 24h `"HH:MM"` string whenever a cell is picked. */
    onChange: (value: string) => void;
    /** Granularity of the minute column. Defaults to `5`. */
    minuteStep?: number;
    /** When true, show a 1–12 hour column plus an AM/PM column (still emits 24h). */
    use12Hours?: boolean;
    label?: string;
    helperText?: string;
    disabled?: boolean;
    className?: string;
}

type Period = "AM" | "PM";

interface ParsedTime {
    hour24: number | null;
    minute: number | null;
}

function pad2(value: number): string {
    return value.toString().padStart(2, "0");
}

/** Parse a 24h `"HH:MM"` string into hour/minute numbers, or nulls when empty/invalid. */
function parseValue(value: string): ParsedTime {
    const match = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim());
    if (!match) return { hour24: null, minute: null };
    const hour24 = Number(match[1]);
    const minute = Number(match[2]);
    if (hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) {
        return { hour24: null, minute: null };
    }
    return { hour24, minute };
}

/** Convert a 24h hour into its 12h display hour (1–12). */
function to12Hour(hour24: number): number {
    const mod = hour24 % 12;
    return mod === 0 ? 12 : mod;
}

/** Convert a 12h display hour + period into a 24h hour (0–23). */
function to24Hour(hour12: number, period: Period): number {
    const base = hour12 % 12;
    return period === "PM" ? base + 12 : base;
}

/**
 * TimePicker — inline, dependency-free time picker with Material "spinner column" styling.
 *
 * Renders scrollable columns of selectable cells (hours, minutes, and AM/PM when
 * `use12Hours`). Always emits a 24h `"HH:MM"` string via `onChange`, regardless of
 * whether the 12h display is enabled.
 */
export function TimePicker({
    value,
    onChange,
    minuteStep = 5,
    use12Hours = false,
    label,
    helperText,
    disabled,
    className,
}: TimePickerProps) {
    const id = useId();
    const { hour24, minute } = useMemo(() => parseValue(value), [value]);

    const period: Period = hour24 !== null && hour24 >= 12 ? "PM" : "AM";

    const hourCells = useMemo<number[]>(() => {
        if (use12Hours) {
            return Array.from({ length: 12 }, (_, index) => index + 1);
        }
        return Array.from({ length: 24 }, (_, index) => index);
    }, [use12Hours]);

    const minuteCells = useMemo<number[]>(() => {
        const step = minuteStep > 0 ? minuteStep : 1;
        const cells: number[] = [];
        for (let current = 0; current < 60; current += step) {
            cells.push(current);
        }
        return cells;
    }, [minuteStep]);

    const selectedHourDisplay = hour24 === null ? null : use12Hours ? to12Hour(hour24) : hour24;

    const emit = (nextHour24: number, nextMinute: number): void => {
        onChange(`${pad2(nextHour24)}:${pad2(nextMinute)}`);
    };

    const handleHour = (displayHour: number): void => {
        if (disabled) return;
        const nextMinute = minute ?? 0;
        const nextHour24 = use12Hours ? to24Hour(displayHour, period) : displayHour;
        emit(nextHour24, nextMinute);
    };

    const handleMinute = (nextMinute: number): void => {
        if (disabled) return;
        const baseHour24 = hour24 ?? (use12Hours ? to24Hour(12, "AM") : 0);
        emit(baseHour24, nextMinute);
    };

    const handlePeriod = (nextPeriod: Period): void => {
        if (disabled) return;
        const displayHour = selectedHourDisplay ?? 12;
        const nextMinute = minute ?? 0;
        emit(to24Hour(displayHour, nextPeriod), nextMinute);
    };

    return (
        <div className={cn(styles.wrapper, disabled && styles.disabled, className)}>
            {label && (
                <span id={`${id}-label`} className={styles.label}>
                    {label}
                </span>
            )}
            <div className={styles.columns}>
                <ul role="listbox" aria-label="Horas" className={styles.column}>
                    {hourCells.map((cell) => {
                        const active = cell === selectedHourDisplay;
                        return (
                            <li key={cell} className={styles.cellWrapper}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    disabled={disabled}
                                    className={cn(styles.cell, active && styles.active)}
                                    onClick={() => handleHour(cell)}
                                >
                                    {use12Hours ? cell : pad2(cell)}
                                </button>
                            </li>
                        );
                    })}
                </ul>
                <ul role="listbox" aria-label="Minutos" className={styles.column}>
                    {minuteCells.map((cell) => {
                        const active = cell === minute;
                        return (
                            <li key={cell} className={styles.cellWrapper}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    disabled={disabled}
                                    className={cn(styles.cell, active && styles.active)}
                                    onClick={() => handleMinute(cell)}
                                >
                                    {pad2(cell)}
                                </button>
                            </li>
                        );
                    })}
                </ul>
                {use12Hours && (
                    <ul role="listbox" aria-label="Período" className={styles.column}>
                        {(["AM", "PM"] as Period[]).map((cell) => {
                            const active = selectedHourDisplay !== null && cell === period;
                            return (
                                <li key={cell} className={styles.cellWrapper}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={active}
                                        disabled={disabled}
                                        className={cn(styles.cell, active && styles.active)}
                                        onClick={() => handlePeriod(cell)}
                                    >
                                        {cell}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
            {helperText && <span className={styles.helper}>{helperText}</span>}
        </div>
    );
}

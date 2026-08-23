/**
 * @tempest-limits file-lines, props-count, function-lines — the grid is defined by
 * anchor, days, startHour, endHour and snapMinutes; the content by events,
 * renderEvent, onEventClick and onSlotClick; the reading by locale, showCurrentTime
 * and now. The body lays out overlapping events into columns, which needs the whole
 * day's events at once.
 */
import { type HTMLAttributes, type ReactNode, useEffect, useMemo, useState } from "react";

import { cn } from "@/utils/cn";

import {
    dayRange,
    type DayWindow,
    fractionOfWindow,
    hourMarks,
    isSameDay,
    layoutAllDay,
    layoutEvents,
    type SchedulerEvent,
} from "./scheduler-layout";
import styles from "./Scheduler.module.css";

export interface SchedulerProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /** Events to place. Instants are read in the browser's local time. */
    events: readonly SchedulerEvent[];
    /** Any day within the range to show. Default: today. */
    anchor?: Date;
    /** How many consecutive days to render. `1` is a day view, `7` a week. Default `7`. */
    days?: number;
    /** First visible hour, `0`–`23`. Default `8`. */
    startHour?: number;
    /** Last visible hour, `1`–`24`. Default `20`. */
    endHour?: number;
    /** Minutes a click on empty space snaps to. Default `30`. */
    snapMinutes?: number;
    /** Called when an event is activated by click, `Enter` or `Space`. */
    onEventClick?: (event: SchedulerEvent) => void;
    /** Called with the snapped instant when empty space is clicked. */
    onSlotClick?: (start: Date) => void;
    /** Render an event's contents. Defaults to its title and start time. */
    renderEvent?: (event: SchedulerEvent) => ReactNode;
    /** Locale for the day and hour labels. Default `"pt-BR"`. */
    locale?: string;
    /** Draw the current-time line. Default `true`. */
    showCurrentTime?: boolean;
    /** Fixed "now" for the indicator. Default: the real clock, ticking each minute. */
    now?: Date;
}

/** Minutes between ticks of the current-time indicator. */
const TICK_MS = 60_000;

/**
 * An agenda: events placed on a time grid across consecutive days.
 *
 * `Calendar` is a date *picker* — it answers "which day?". This answers "what is on
 * those days, and when", which needs a different structure entirely: a vertical time
 * axis, events sized by duration, and overlapping events sitting side by side.
 *
 * That last part is the one worth naming. Overlapping events are grouped into
 * clusters of mutual overlap and every event in a cluster shares one column count,
 * so widths line up; a column is reused the moment it frees, so `9–10`, `9–10`,
 * `10–11` takes two columns and not three. The layout is pure and lives in
 * `scheduler-layout.ts`.
 *
 * Times are local. An event crossing midnight is split into both day columns, and
 * the day range is built by incrementing the calendar day, so a DST boundary does
 * not duplicate or skip a date.
 *
 * @example
 * <Scheduler
 *     events={bookings}
 *     days={7}
 *     startHour={7}
 *     endHour={21}
 *     onEventClick={(e) => open(e.id)}
 *     onSlotClick={(start) => createAt(start)}
 * />
 */
export function Scheduler({
    events,
    anchor,
    days: dayCount = 7,
    startHour = 8,
    endHour = 20,
    snapMinutes = 30,
    onEventClick,
    onSlotClick,
    renderEvent,
    locale = "pt-BR",
    showCurrentTime = true,
    now,
    className,
    ...rest
}: SchedulerProps) {
    const [clock, setClock] = useState<Date>(() => now ?? new Date());

    /**
     * Keep the current-time line moving.
     *
     * Skipped entirely when `now` is supplied: that is the hook tests and demos use
     * to be deterministic, and a timer would fight it.
     */
    useEffect(() => {
        if (now || !showCurrentTime) return;
        const id = setInterval(() => setClock(new Date()), TICK_MS);
        return () => clearInterval(id);
    }, [now, showCurrentTime]);

    const reference = now ?? clock;

    const window = useMemo<DayWindow>(
        () => ({ startMinute: startHour * 60, endMinute: endHour * 60 }),
        [startHour, endHour],
    );

    /**
     * The calendar day the range starts from, as a stable string.
     *
     * `reference` ticks every minute when the current-time line is live. Depending on
     * the Date itself would re-slice the day range — and therefore relayout every
     * event — once a minute; depending on the day only recomputes at midnight.
     */
    const anchorDay = (anchor ?? reference).toDateString();
    const dayList = useMemo(() => dayRange(new Date(anchorDay), dayCount), [anchorDay, dayCount]);

    const placed = useMemo(
        () => layoutEvents({ events, days: dayList, window }),
        [events, dayList, window],
    );
    const allDay = useMemo(() => layoutAllDay({ events, days: dayList }), [events, dayList]);
    const marks = useMemo(() => hourMarks(window), [window]);

    const dayLabel = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" });
    const timeLabel = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });

    /** Turn a click's vertical position within a day column into a snapped instant. */
    const slotFromClick = (day: Date, event: React.MouseEvent<HTMLDivElement>): Date => {
        const rect = event.currentTarget.getBoundingClientRect();
        const fraction = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
        const raw = window.startMinute + fraction * (window.endMinute - window.startMinute);
        const snapped = Math.round(raw / snapMinutes) * snapMinutes;
        const clamped = Math.max(window.startMinute, Math.min(window.endMinute, snapped));
        const result = new Date(day);
        result.setHours(0, clamped, 0, 0);
        return result;
    };

    const currentFraction = showCurrentTime ? fractionOfWindow(reference, window) : null;
    const todayIndex = dayList.findIndex((day) => isSameDay(day, reference));

    return (
        <div className={cn(styles.wrapper, className)} {...rest}>
            <div
                className={styles.head}
                style={{ ["--tempest-scheduler-days" as string]: dayCount }}
            >
                <span className={styles.gutterHead} />
                {dayList.map((day, index) => (
                    <span
                        key={day.toISOString()}
                        className={cn(styles.dayHead, index === todayIndex && styles.today)}
                    >
                        {dayLabel.format(day)}
                    </span>
                ))}
            </div>

            {allDay.length > 0 && (
                <div
                    className={styles.allDayLane}
                    style={{ ["--tempest-scheduler-days" as string]: dayCount }}
                >
                    <span className={styles.gutterHead}>Dia inteiro</span>
                    <div className={styles.allDayTrack}>
                        {allDay.map(({ event, dayIndex, span }) => (
                            <button
                                key={event.id}
                                type="button"
                                className={styles.allDayEvent}
                                style={{ gridColumn: `${dayIndex + 1} / span ${span}` }}
                                onClick={() => onEventClick?.(event)}
                                disabled={!onEventClick}
                            >
                                {event.title}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/*
             * Focusable because it scrolls vertically: a scroll region that cannot be
             * focused is unreachable by keyboard, which is what `axe`'s
             * `scrollable-region-focusable` rule is about. It needs a name too, or the
             * new tab stop would announce nothing — but `group`, not `region`: a named
             * `region` is a landmark, and two schedulers on one page would then be two
             * identically-named landmarks (`landmark-unique`).
             */}
            <div
                className={styles.body}
                style={{ ["--tempest-scheduler-days" as string]: dayCount }}
                tabIndex={0}
                role="group"
                aria-label="Grade de horários"
            >
                <div className={styles.gutter}>
                    {marks.map((minute) => (
                        <span
                            key={minute}
                            className={styles.hourLabel}
                            style={{
                                top: `${((minute - window.startMinute) / (window.endMinute - window.startMinute)) * 100}%`,
                            }}
                        >
                            {timeLabel.format(
                                new Date(2026, 0, 1, Math.floor(minute / 60), minute % 60),
                            )}
                        </span>
                    ))}
                </div>

                {/*
                 * Not `role="grid"`: that requires `row` children, and the events are
                 * siblings of the day columns inside one CSS grid — a `row` wrapper
                 * would stop the columns being grid items and collapse the layout.
                 * A labelled group per day is the honest structure anyway: a screen
                 * reader tabs the event buttons and the group name supplies the day.
                 */}
                <div className={styles.grid} aria-label="Agenda">
                    {dayList.map((day, index) => (
                        <div
                            key={day.toISOString()}
                            className={cn(
                                styles.dayColumn,
                                index === todayIndex && styles.todayColumn,
                            )}
                            role="group"
                            aria-label={dayLabel.format(day)}
                            onClick={
                                onSlotClick
                                    ? (event) => {
                                          // Only empty space creates: a click that
                                          // landed on an event is that event's.
                                          if (event.target !== event.currentTarget) return;
                                          onSlotClick(slotFromClick(day, event));
                                      }
                                    : undefined
                            }
                        >
                            {marks.map((minute) => (
                                <span
                                    key={minute}
                                    className={styles.hourLine}
                                    style={{
                                        top: `${((minute - window.startMinute) / (window.endMinute - window.startMinute)) * 100}%`,
                                    }}
                                />
                            ))}
                        </div>
                    ))}

                    {placed.map((item) => (
                        <button
                            key={`${item.event.id}-${item.dayIndex}`}
                            type="button"
                            className={styles.event}
                            style={{
                                gridColumn: `${item.dayIndex + 1} / span 1`,
                                top: `${item.top * 100}%`,
                                height: `${item.height * 100}%`,
                                left: `${(item.column / item.columns) * 100}%`,
                                width: `${(1 / item.columns) * 100}%`,
                            }}
                            onClick={() => onEventClick?.(item.event)}
                            disabled={!onEventClick}
                            title={`${item.event.title} — ${timeLabel.format(item.event.start)}`}
                        >
                            {renderEvent ? (
                                renderEvent(item.event)
                            ) : (
                                <>
                                    <span className={styles.eventTime}>
                                        {timeLabel.format(item.event.start)}
                                    </span>
                                    <span className={styles.eventTitle}>{item.event.title}</span>
                                </>
                            )}
                        </button>
                    ))}

                    {currentFraction !== null && todayIndex >= 0 && (
                        <span
                            className={styles.nowLine}
                            style={{ top: `${currentFraction * 100}%` }}
                            aria-hidden
                            data-testid="scheduler-now"
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export type { SchedulerEvent };

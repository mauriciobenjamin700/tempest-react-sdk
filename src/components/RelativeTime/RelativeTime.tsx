import { useEffect, useState, type HTMLAttributes, type ReactElement } from "react";
import { relativeTime } from "@/utils/relative-time";

export interface RelativeTimeProps extends HTMLAttributes<HTMLTimeElement> {
    /** The instant to render relative to now. */
    date: Date | string | number;
    /** Output language. Defaults to "pt". */
    locale?: "pt" | "en";
    /**
     * The instant "now" is, when the app already keeps a clock — one interval
     * shared by a whole list, or the time a test pins. Wins over `updateEvery`.
     * Default: the time of the render.
     */
    now?: Date | number;
    /**
     * Re-render on its own every this many milliseconds, so "1 min atrás" keeps
     * counting while nothing else on the screen changes. Values that are not a
     * positive number leave it off. Ignored while `now` is set. Default: off.
     */
    updateEvery?: number;
}

/**
 * The instant to render against: the app's `now`, or a clock the component
 * advances itself every `updateEvery` ms.
 *
 * The internal clock is opt-in. A list of a hundred rows that each ran an
 * interval would wake the page a hundred times per tick; one `now` from the
 * parent is the cheaper shape there, and `updateEvery` is for the lone
 * timestamp that has nothing above it to re-render it.
 *
 * @param now - The app's clock, when it has one.
 * @param updateEvery - Interval of the internal clock, in ms.
 * @returns The reference instant, or `undefined` for "the time of the render".
 */
function useClock(
    now: Date | number | undefined,
    updateEvery: number | undefined,
): number | undefined {
    const ticking =
        now === undefined &&
        updateEvery !== undefined &&
        Number.isFinite(updateEvery) &&
        updateEvery > 0;
    const [tick, setTick] = useState<number>(() => Date.now());

    useEffect(() => {
        if (!ticking) return;
        setTick(Date.now());
        const timer = setInterval(() => setTick(Date.now()), updateEvery);
        return () => clearInterval(timer);
    }, [ticking, updateEvery]);

    if (now !== undefined) return typeof now === "number" ? now : now.getTime();
    return ticking ? tick : undefined;
}

/**
 * Render a date as a human-friendly relative-time string (e.g. "5 min atrás")
 * inside a semantic `<time>` element with a machine-readable `dateTime`.
 *
 * Delegates the wording to the `relativeTime` util; "pt" maps to its "pt-BR"
 * locale. Without `now` or `updateEvery` the text is computed at render and
 * stays as it was until something re-renders the component — "agora há pouco"
 * frozen next to a position that is four minutes old. Pass the app's clock as
 * `now`, or `updateEvery` for the component to keep its own.
 *
 * @example
 * <RelativeTime date={post.createdAt} locale="en" />
 * <RelativeTime date={position.timestamp} updateEvery={15_000} />
 * <RelativeTime date={position.timestamp} now={clock} />
 */
export function RelativeTime({
    date,
    locale = "pt",
    now,
    updateEvery,
    ...props
}: RelativeTimeProps): ReactElement {
    const reference = useClock(now, updateEvery);
    const target = date instanceof Date ? date : new Date(date);
    const iso = Number.isNaN(target.getTime()) ? undefined : target.toISOString();
    const label = relativeTime(date, {
        locale: locale === "pt" ? "pt-BR" : "en",
        now: reference,
    });

    return (
        <time dateTime={iso} {...props}>
            {label}
        </time>
    );
}

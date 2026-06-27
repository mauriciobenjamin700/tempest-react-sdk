import type { HTMLAttributes } from "react";
import { relativeTime } from "@/utils/relative-time";

export interface RelativeTimeProps extends HTMLAttributes<HTMLTimeElement> {
    /** The instant to render relative to now. */
    date: Date | string | number;
    /** Output language. Defaults to "pt". */
    locale?: "pt" | "en";
}

/**
 * Render a date as a human-friendly relative-time string (e.g. "5 min atrás")
 * inside a semantic `<time>` element with a machine-readable `dateTime`.
 *
 * Delegates the wording to the `relativeTime` util; "pt" maps to its "pt-BR"
 * locale.
 *
 * @example
 * <RelativeTime date={post.createdAt} locale="en" />
 */
export function RelativeTime({ date, locale = "pt", ...props }: RelativeTimeProps) {
    const target = date instanceof Date ? date : new Date(date);
    const iso = Number.isNaN(target.getTime()) ? undefined : target.toISOString();
    const label = relativeTime(date, { locale: locale === "pt" ? "pt-BR" : "en" });

    return (
        <time dateTime={iso} {...props}>
            {label}
        </time>
    );
}

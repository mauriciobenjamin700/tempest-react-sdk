import { fallbackText, isAbsent, type FormatFallbackOptions } from "@/utils/absent";
import { dateTimeFormat } from "@/utils/intl-cache";

export type RelativeTimeLocale = "pt-BR" | "en";

interface Strings {
    justNow: string;
    secondsAgo: (n: number) => string;
    minutesAgo: (n: number) => string;
    hoursAgo: (n: number) => string;
    daysAgo: (n: number) => string;
    weeksAgo: (n: number) => string;
    monthsAgo: (n: number) => string;
    yearsAgo: (n: number) => string;
    inSeconds: (n: number) => string;
    inMinutes: (n: number) => string;
    inHours: (n: number) => string;
    inDays: (n: number) => string;
    inWeeks: (n: number) => string;
    inMonths: (n: number) => string;
    inYears: (n: number) => string;
}

const PT_BR: Strings = {
    justNow: "agora há pouco",
    secondsAgo: (n) => `${n} s atrás`,
    minutesAgo: (n) => `${n} min atrás`,
    hoursAgo: (n) => (n === 1 ? "1 hora atrás" : `${n} horas atrás`),
    daysAgo: (n) => (n === 1 ? "ontem" : `${n} dias atrás`),
    weeksAgo: (n) => (n === 1 ? "semana passada" : `${n} semanas atrás`),
    monthsAgo: (n) => (n === 1 ? "mês passado" : `${n} meses atrás`),
    yearsAgo: (n) => (n === 1 ? "ano passado" : `${n} anos atrás`),
    inSeconds: (n) => `em ${n} s`,
    inMinutes: (n) => `em ${n} min`,
    inHours: (n) => `em ${n} h`,
    inDays: (n) => `em ${n} ${n === 1 ? "dia" : "dias"}`,
    inWeeks: (n) => `em ${n} ${n === 1 ? "semana" : "semanas"}`,
    inMonths: (n) => `em ${n} ${n === 1 ? "mês" : "meses"}`,
    inYears: (n) => `em ${n} ${n === 1 ? "ano" : "anos"}`,
};

const EN: Strings = {
    justNow: "just now",
    secondsAgo: (n) => `${n}s ago`,
    minutesAgo: (n) => `${n}m ago`,
    hoursAgo: (n) => `${n}h ago`,
    daysAgo: (n) => (n === 1 ? "yesterday" : `${n} days ago`),
    weeksAgo: (n) => `${n}w ago`,
    monthsAgo: (n) => `${n}mo ago`,
    yearsAgo: (n) => `${n}y ago`,
    inSeconds: (n) => `in ${n}s`,
    inMinutes: (n) => `in ${n}m`,
    inHours: (n) => `in ${n}h`,
    inDays: (n) => `in ${n}d`,
    inWeeks: (n) => `in ${n}w`,
    inMonths: (n) => `in ${n}mo`,
    inYears: (n) => `in ${n}y`,
};

const LOCALES: Record<RelativeTimeLocale, Strings> = { "pt-BR": PT_BR, en: EN };

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Render a `Date` / ISO string as a relative-time string. Supports past and
 * future, PT-BR (default) and English.
 *
 * @example
 * relativeTime(new Date(Date.now() - 90_000));         // "1 min atrás"
 * relativeTime("2026-05-17T10:00:00Z", { locale: "en" }); // "5h ago"
 */
export function relativeTime(
    input: Date | string | number,
    options: { locale?: RelativeTimeLocale; now?: Date | number } = {},
): string {
    const { locale = "pt-BR", now = Date.now() } = options;
    const strings = LOCALES[locale];
    const target = input instanceof Date ? input.getTime() : new Date(input).getTime();
    const nowMs = typeof now === "number" ? now : now.getTime();
    const diff = nowMs - target;
    const past = diff >= 0;
    const abs = Math.abs(diff);

    if (abs < 30 * SECOND) return strings.justNow;
    if (abs < MINUTE) {
        const n = Math.round(abs / SECOND);
        return past ? strings.secondsAgo(n) : strings.inSeconds(n);
    }
    if (abs < HOUR) {
        const n = Math.round(abs / MINUTE);
        return past ? strings.minutesAgo(n) : strings.inMinutes(n);
    }
    if (abs < DAY) {
        const n = Math.round(abs / HOUR);
        return past ? strings.hoursAgo(n) : strings.inHours(n);
    }
    if (abs < WEEK) {
        const n = Math.round(abs / DAY);
        return past ? strings.daysAgo(n) : strings.inDays(n);
    }
    if (abs < MONTH) {
        const n = Math.round(abs / WEEK);
        return past ? strings.weeksAgo(n) : strings.inWeeks(n);
    }
    if (abs < YEAR) {
        const n = Math.round(abs / MONTH);
        return past ? strings.monthsAgo(n) : strings.inMonths(n);
    }
    const n = Math.round(abs / YEAR);
    return past ? strings.yearsAgo(n) : strings.inYears(n);
}

/** The words {@link relativeDayLabel} uses for the two named days. */
export interface RelativeDayLabels {
    /** Label for a date on the current local calendar day. */
    today: string;
    /** Label for a date on the previous local calendar day. */
    yesterday: string;
}

/** Options for {@link relativeDayLabel}. */
export interface RelativeDayLabelOptions extends FormatFallbackOptions {
    /** Language of the labels and of the date format. Defaults to `"pt-BR"`. */
    locale?: RelativeTimeLocale;
    /** Reference instant that defines "today". Defaults to `Date.now()`. */
    now?: Date | number;
    /** Override one or both labels; the rest come from `locale`. */
    labels?: Partial<RelativeDayLabels>;
}

const DAY_LABELS: Record<RelativeTimeLocale, RelativeDayLabels> = {
    "pt-BR": { today: "Hoje", yesterday: "Ontem" },
    en: { today: "Today", yesterday: "Yesterday" },
};

/**
 * Parse the accepted inputs into a `Date`, reading a bare `yyyy-MM-dd` as a
 * **local** calendar date.
 *
 * `new Date("2026-05-16")` is UTC midnight, which in UTC-3 is the 15th at 21:00,
 * so the day a backend sent would be labelled as the day before.
 *
 * @param input - A `Date`, epoch milliseconds or a date string.
 * @returns The parsed date, possibly invalid.
 */
function toLocalDate(input: Date | string | number): Date {
    if (input instanceof Date) return input;
    if (typeof input === "string") {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
        if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
    return new Date(input);
}

/**
 * Whether two dates fall on the same local calendar day.
 *
 * @param a - First date.
 * @param b - Second date.
 * @returns `true` when year, month and day match in the local time zone.
 */
function sameLocalDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

/**
 * Label a date as `"Hoje"`, `"Ontem"` or the date itself (`dd/MM/yyyy` in
 * PT-BR), for the headers of a list grouped by day.
 *
 * It answers a different question from {@link relativeTime}: that one measures
 * elapsed time ("2 horas atrás"), this one names the calendar day. The two
 * disagree around midnight on purpose — at 00:10 a message from 23:50 is
 * "20 min atrás" and also "Ontem".
 *
 * Days are compared in the **local** time zone by calendar fields, never by
 * subtracting 24 hours: "yesterday" is the local date before today's, which
 * stays right across a daylight-saving shift where a day lasts 23 or 25 hours.
 * A bare `yyyy-MM-dd` string is read as a local date for the same reason.
 *
 * Anything else — tomorrow, two days ago, last year — renders as the date.
 * Absent input answers the fallback (`"—"`) and an unparseable value answers
 * `""`, matching `formatDate`.
 *
 * @example
 * relativeDayLabel(new Date());                                     // "Hoje"
 * relativeDayLabel("2026-05-15", { now: new Date(2026, 4, 16) });  // "Ontem"
 * relativeDayLabel("2026-05-10", { now: new Date(2026, 4, 16) });  // "10/05/2026"
 * relativeDayLabel(new Date(), { locale: "en" });                   // "Today"
 *
 * @param input - A `Date`, epoch milliseconds, an ISO string, or `null`/`undefined`.
 * @param options - Locale, reference instant, label overrides and fallback text.
 * @returns The day label, the formatted date, the fallback when absent, or `""`
 *   when the value is present and invalid.
 */
export function relativeDayLabel(
    input: Date | string | number | null | undefined,
    options: RelativeDayLabelOptions = {},
): string {
    if (isAbsent(input)) return fallbackText(options);
    const date = toLocalDate(input);
    if (Number.isNaN(date.getTime())) return "";
    const { locale = "pt-BR", now = Date.now() } = options;
    const labels: RelativeDayLabels = { ...DAY_LABELS[locale], ...options.labels };
    const today = new Date(now);
    if (sameLocalDay(date, today)) return labels.today;
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (sameLocalDay(date, yesterday)) return labels.yesterday;
    return dateTimeFormat(locale).format(date);
}

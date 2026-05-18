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

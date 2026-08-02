/**
 * How binding a non-working day is.
 *
 * - `"national"` — a feriado nacional in federal law. Nobody works, and a
 *   deadline that lands here moves.
 * - `"banking"` — not a statutory holiday, but a day the national financial
 *   system does not operate: Carnaval (Monday and Tuesday), Sexta-feira da
 *   Paixão and Corpus Christi. Bank branches are shut and compensation does not
 *   run, so a boleto or a TED dated here settles later — but an employer may
 *   legally require work, which is why the two kinds are separate.
 */
export type HolidayKind = "national" | "banking";

/** One non-working day in a given year. */
export interface Holiday {
    /** `YYYY-MM-DD` in the local calendar. */
    date: string;
    /** Portuguese name, as the law or the Bacen calendar spells it. */
    name: string;
    kind: HolidayKind;
    /** `true` when the date is derived from Easter rather than fixed. */
    movable: boolean;
}

/** Anything these helpers accept as a day. */
export type DateInput = Date | string;

/** Options shared by the calendar helpers. */
export interface BusinessDayOptions {
    /**
     * Which kinds count as non-working. Default `["national", "banking"]`, i.e.
     * the Bacen calendar — the right default for anything money moves through.
     * Pass `["national"]` for a labour-law calendar.
     */
    kinds?: readonly HolidayKind[];
    /**
     * Extra non-working days, as `YYYY-MM-DD` or `Date`. This is where state and
     * municipal holidays go: they are **not** in the built-in table and never will
     * be — there are 5 570 municipalities, each free to declare its own.
     */
    extra?: readonly DateInput[];
    /**
     * Days of the week that are not worked, `0` = Sunday. Default `[0, 6]`.
     */
    weekend?: readonly number[];
}

/** Fixed-date national holidays, with the year each became one. */
const FIXED_HOLIDAYS: readonly {
    month: number;
    day: number;
    name: string;
    kind: HolidayKind;
    since?: number;
}[] = [
    { month: 1, day: 1, name: "Confraternização Universal", kind: "national" },
    { month: 4, day: 21, name: "Tiradentes", kind: "national" },
    { month: 5, day: 1, name: "Dia do Trabalho", kind: "national" },
    { month: 9, day: 7, name: "Independência do Brasil", kind: "national" },
    { month: 10, day: 12, name: "Nossa Senhora Aparecida", kind: "national" },
    { month: 11, day: 2, name: "Finados", kind: "national" },
    { month: 11, day: 15, name: "Proclamação da República", kind: "national" },
    {
        month: 11,
        day: 20,
        name: "Dia Nacional de Zumbi e da Consciência Negra",
        kind: "national",
        since: 2024,
    },
    { month: 12, day: 25, name: "Natal", kind: "national" },
];

/** Easter-relative holidays, as a day offset from Easter Sunday. */
const MOVABLE_HOLIDAYS: readonly { offset: number; name: string; kind: HolidayKind }[] = [
    { offset: -48, name: "Carnaval (segunda-feira)", kind: "banking" },
    { offset: -47, name: "Carnaval (terça-feira)", kind: "banking" },
    { offset: -2, name: "Sexta-feira da Paixão", kind: "banking" },
    { offset: 60, name: "Corpus Christi", kind: "banking" },
];

const DEFAULT_KINDS: readonly HolidayKind[] = ["national", "banking"];
const DEFAULT_WEEKEND: readonly number[] = [0, 6];
const MS_PER_DAY = 86_400_000;

/**
 * How far a walk may go before it is treated as a bug rather than a long holiday.
 *
 * A real calendar never has more than a handful of consecutive non-working days,
 * so hitting this means `extra` or `weekend` marked every day off, and looping
 * forever is worse than an error.
 */
const MAX_WALK_DAYS = 400;

/** `YYYY-MM-DD` from a local-calendar date. */
function toIso(year: number, month: number, day: number): string {
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Local midnight for any accepted input.
 *
 * Everything here works on local calendar components, never on UTC: `new Date(y,
 * m, d)` and `getFullYear()/getMonth()/getDate()`. Going through `toISOString()`
 * would shift the day for every viewer east of Greenwich, and "is today a
 * holiday" is a question about the viewer's calendar.
 *
 * @throws {RangeError} When a string is not `YYYY-MM-DD` or a `Date` is invalid.
 */
function toLocalDate(input: DateInput): Date {
    if (typeof input === "string") {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
        if (match === null) {
            throw new RangeError(`Expected a YYYY-MM-DD date, got ${JSON.stringify(input)}.`);
        }
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
    if (Number.isNaN(input.getTime())) throw new RangeError("Received an Invalid Date.");
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
}

/** `YYYY-MM-DD` for any accepted input. */
function isoOf(input: DateInput): string {
    const date = toLocalDate(input);
    return toIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * Easter Sunday in the Gregorian calendar.
 *
 * The anonymous Gregorian computus (Meeus/Jones/Butcher): pure integer
 * arithmetic over the year, no tables and no dependency. It is exact for every
 * Gregorian year, which is why the four movable Brazilian holidays are derived
 * from it rather than listed.
 *
 * @param year - Gregorian year.
 * @returns Local midnight of Easter Sunday.
 *
 * @example
 * easterSunday(2026); // 2026-04-05
 */
export function easterSunday(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

/**
 * Every national non-working day in a year, ordered by date.
 *
 * **What is here:** the nine feriados nacionais in federal law (Lei 662/1949 as
 * amended by Lei 10.607/2002, Lei 6.802/1980 for 12 October, and Lei 14.759/2023
 * for 20 November, which is why that one only appears from 2024), plus the four
 * movable days the national financial system observes.
 *
 * **What is deliberately not here**, and will not be:
 *
 * - **State and municipal holidays.** A data magna varies by state and each of the
 *   5 570 municipalities may declare its own, including up to four religious
 *   days. No table can be both complete and current; pass them through
 *   `options.extra`.
 * - **Ponto facultativo.** A federal decree that lets public servants off is not a
 *   holiday and binds nobody else, so it changes no deadline.
 * - **Pre-2002 history.** The table encodes the law as it stands today. Asking for
 *   1998 returns today's set shifted to 1998, not what was in force then.
 *
 * Carnaval, Sexta-feira da Paixão and Corpus Christi are the interesting case:
 * none of them is a feriado nacional in federal law, yet CMN Resolução 4.880/2020
 * closes the banks on all four days, so a payment cannot settle. They are returned
 * with `kind: "banking"` — counted by default, and excluded by passing
 * `kinds: ["national"]`.
 *
 * @param year - Gregorian year.
 * @returns The holidays of that year, ascending by date.
 *
 * @example
 * holidaysFor(2026).filter((holiday) => holiday.kind === "national").length; // 9
 */
export function holidaysFor(year: number): Holiday[] {
    const holidays: Holiday[] = FIXED_HOLIDAYS.filter(
        (entry) => entry.since === undefined || year >= entry.since,
    ).map((entry) => ({
        date: toIso(year, entry.month, entry.day),
        name: entry.name,
        kind: entry.kind,
        movable: false,
    }));

    const easter = easterSunday(year);
    for (const entry of MOVABLE_HOLIDAYS) {
        const date = new Date(easter.getTime() + entry.offset * MS_PER_DAY);
        holidays.push({
            date: toIso(date.getFullYear(), date.getMonth() + 1, date.getDate()),
            name: entry.name,
            kind: entry.kind,
            movable: true,
        });
    }

    return holidays.sort((left, right) => left.date.localeCompare(right.date));
}

/** The set of `YYYY-MM-DD` strings that count as off for a given year. */
function offDays(year: number, options: BusinessDayOptions): Set<string> {
    const kinds = options.kinds ?? DEFAULT_KINDS;
    const days = new Set(
        holidaysFor(year)
            .filter((holiday) => kinds.includes(holiday.kind))
            .map((holiday) => holiday.date),
    );
    for (const entry of options.extra ?? []) days.add(isoOf(entry));
    return days;
}

/**
 * Whether a date is a national holiday.
 *
 * @param date - `YYYY-MM-DD` or a `Date`. Only the local calendar day matters.
 * @param options - See {@link BusinessDayOptions}. `weekend` is ignored here — a
 * Sunday is not a holiday, it is a Sunday.
 * @returns `true` when the day is in the table (or in `extra`).
 * @throws {RangeError} On a malformed string or an Invalid Date.
 *
 * @example
 * isHoliday("2026-11-20"); // true
 * isHoliday("2026-02-17"); // true — Carnaval
 * isHoliday("2026-02-17", { kinds: ["national"] }); // false
 */
export function isHoliday(date: DateInput, options: BusinessDayOptions = {}): boolean {
    const iso = isoOf(date);
    return offDays(Number(iso.slice(0, 4)), options).has(iso);
}

/**
 * Whether a date is a working day: not a weekend, not a holiday.
 *
 * @param date - `YYYY-MM-DD` or a `Date`.
 * @param options - See {@link BusinessDayOptions}.
 * @returns `true` when work happens on that day.
 * @throws {RangeError} On a malformed string or an Invalid Date.
 *
 * @example
 * isBusinessDay("2026-04-03"); // false — Sexta-feira da Paixão
 */
export function isBusinessDay(date: DateInput, options: BusinessDayOptions = {}): boolean {
    const local = toLocalDate(date);
    const weekend = options.weekend ?? DEFAULT_WEEKEND;
    if (weekend.includes(local.getDay())) return false;
    return !isHoliday(local, options);
}

/**
 * The first working day strictly after a date.
 *
 * Strictly after: calling it on a Wednesday returns Thursday, never the same
 * Wednesday. That is what a "prazo de D+1" means, and it makes the function safe
 * to call in a loop.
 *
 * @param date - `YYYY-MM-DD` or a `Date`.
 * @param options - See {@link BusinessDayOptions}.
 * @returns Local midnight of the next working day.
 * @throws {RangeError} On a malformed input, or when `options` marked so many days
 * off that no working day exists within {@link MAX_WALK_DAYS}.
 *
 * @example
 * nextBusinessDay("2026-12-24"); // 2026-12-28 — the 25th is Natal, then a weekend
 */
export function nextBusinessDay(date: DateInput, options: BusinessDayOptions = {}): Date {
    const cursor = toLocalDate(date);
    for (let step = 0; step < MAX_WALK_DAYS; step += 1) {
        cursor.setDate(cursor.getDate() + 1);
        if (isBusinessDay(cursor, options)) return cursor;
    }
    throw new RangeError(
        `No business day within ${MAX_WALK_DAYS} days of ${isoOf(date)} — check \`weekend\` and \`extra\`.`,
    );
}

/**
 * Move a date by a number of working days.
 *
 * `n` days forward means `n` calls to {@link nextBusinessDay}; a negative `n`
 * walks backwards the same way. `n === 0` returns the day unchanged **even when it
 * is not a working day** — snapping silently would hide the case a caller most
 * needs to see.
 *
 * @param date - `YYYY-MM-DD` or a `Date`.
 * @param days - Working days to add. May be negative.
 * @param options - See {@link BusinessDayOptions}.
 * @returns Local midnight of the resulting day.
 * @throws {RangeError} On a malformed input, or on a calendar with no working days.
 *
 * @example
 * addBusinessDays("2026-04-01", 2); // 2026-04-06 — skips Good Friday and the weekend
 */
export function addBusinessDays(
    date: DateInput,
    days: number,
    options: BusinessDayOptions = {},
): Date {
    const cursor = toLocalDate(date);
    const direction = days < 0 ? -1 : 1;
    for (let moved = 0; moved < Math.abs(days); moved += 1) {
        let landed = false;
        for (let step = 0; step < MAX_WALK_DAYS && !landed; step += 1) {
            cursor.setDate(cursor.getDate() + direction);
            landed = isBusinessDay(cursor, options);
        }
        if (!landed) {
            throw new RangeError(
                `No business day within ${MAX_WALK_DAYS} days while walking from ${isoOf(date)} — ` +
                    "check `weekend` and `extra`.",
            );
        }
    }
    return cursor;
}

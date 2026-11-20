import { fallbackText, isAbsent, type FormatFallbackOptions } from "./absent";
import { dateTimeFormat, numberFormat } from "@/utils/intl-cache";

/**
 * Format a number as Brazilian Real currency.
 *
 * An absent or unrepresentable amount renders as `"—"` rather than as a number.
 * That branch is a data-correctness fix, not cosmetics: `Intl` coerces `null` to
 * zero, so an amount the backend left out used to reach the screen as
 * **`"R$ 0,00"`** — a plausible figure a reader has no way to question — and
 * `undefined` as `"R$ NaN"`.
 *
 * @example
 * ```typescript
 * formatCurrency(1234.56);                      // "R$ 1.234,56"
 * formatCurrency(null);                         // "—"
 * formatCurrency(null, { fallback: "sem valor" }); // "sem valor"
 * ```
 *
 * @param value - The amount in BRL, or `null`/`undefined` when there is none.
 * @param options - Text to render when there is nothing to format.
 * @returns A locale-formatted string, e.g. "R$ 1.234,56".
 */
export function formatCurrency(
    value: number | null | undefined,
    options?: FormatFallbackOptions,
): string {
    if (isAbsent(value) || !Number.isFinite(value)) return fallbackText(options);
    return numberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/** Options of {@link formatCents}. */
export interface FormatCentsOptions extends FormatFallbackOptions {
    /** ISO 4217 currency code. Default: `"BRL"`. */
    currency?: string;
    /** BCP 47 locale. Default: `"pt-BR"`. */
    locale?: string;
}

/**
 * The slice of `Intl.NumberFormat` that takes a decimal string.
 *
 * ES2023's Intl.NumberFormat v3 formats a string such as `"90071992547409.91"`
 * as an exact decimal; the `ES2022` lib this package compiles against only
 * declares `number | bigint`. Engines without v3 coerce the string with
 * `Number()`, which is exactly what the float path did before.
 */
interface DecimalStringFormatter {
    format(value: string): string;
}

/**
 * Write an integer number of cents as a plain decimal string with a dot and two
 * fraction digits — `1234` → `"12.34"`, `5` → `"0.05"`, `-250` → `"-2.50"`.
 *
 * Built from the digits rather than `(cents / 100).toFixed(2)`: the division is a
 * float, and at the top of the safe-integer range it rounds the last cent away
 * (`9007199254740991 / 100` formats as `…409,90`, the digits say `…409,91`).
 *
 * @param cents - A safe integer.
 * @returns The amount in the major unit, as a dot-decimal string.
 */
export function centsToDecimalString(cents: number): string {
    const digits = Math.abs(cents).toString().padStart(3, "0");
    const sign = cents < 0 ? "-" : "";
    return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/**
 * Format an amount held as integer cents as currency — `1234` → `"R$ 12,34"`.
 *
 * The cents-native sibling of {@link formatCurrency}, which takes the major unit
 * and is fixed to BRL. Money that travels as cents (what `<MoneyInput>`,
 * `<Money>` and every payment gateway hand you) is formatted from its digits, so
 * no amount is ever divided into a float first: that division loses the last
 * cent at the top of the safe-integer range.
 *
 * Absent or non-finite input answers the fallback (`"—"` by default; pass
 * `{ fallback: "" }` to feed an `<input>`). A fractional cent is rounded to the
 * nearest one.
 *
 * @example
 * ```typescript
 * formatCents(1234);                                    // "R$ 12,34"
 * formatCents(null);                                    // "—"
 * formatCents(500, { currency: "USD", locale: "en-US" }); // "$5.00"
 * ```
 *
 * @param cents - The amount in cents, or `null`/`undefined` when there is none.
 * @param options - Currency, locale and the text for an absent amount.
 * @returns The locale-formatted amount, or the fallback.
 */
export function formatCents(
    cents: number | null | undefined,
    options?: FormatCentsOptions,
): string {
    if (isAbsent(cents) || !Number.isFinite(cents)) return fallbackText(options);
    const { currency = "BRL", locale = "pt-BR" } = options ?? {};
    const formatter = numberFormat(locale, { style: "currency", currency });
    const whole = Math.round(cents);
    if (!Number.isSafeInteger(whole)) return formatter.format(whole / 100);
    return (formatter as unknown as DecimalStringFormatter).format(centsToDecimalString(whole));
}

/**
 * Format an ISO date or Date instance as `dd/MM/yyyy`.
 *
 * Absent input answers `"—"`. It used to **throw**: `new Date(null)` is epoch and
 * `null.getTime` is a `TypeError`, so a nullable column — which is every
 * `deleted_at`, `expires_at` and half the `updated_at` a FastAPI backend sends —
 * took the screen down instead of rendering a gap.
 *
 * A value that is present and unparseable still answers `""`, deliberately: on a
 * screen that reads a log, "nobody filled this in" and "what they filled in is
 * broken" are different findings, and the second is the one worth chasing.
 *
 * @example
 * ```typescript
 * formatDate("2026-05-16T12:00:00Z"); // "16/05/2026"
 * formatDate(null);                   // "—"
 * formatDate("banana");               // ""
 * ```
 *
 * @param value - ISO string, Date, or `null`/`undefined`.
 * @param options - Text to render when the value is absent.
 * @returns Formatted date string, the fallback when absent, or empty string when
 *   the value is present and invalid.
 */
export function formatDate(
    value: string | Date | null | undefined,
    options?: FormatFallbackOptions,
): string {
    if (isAbsent(value)) return fallbackText(options);
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return "";
    return dateTimeFormat("pt-BR").format(date);
}

/**
 * Format an ISO date or Date instance as `yyyy-MM-dd`, the value an
 * `<input type="date">` accepts.
 *
 * Built from the **local** calendar parts rather than `toISOString().slice(0, 10)`,
 * which is the reflex and which is wrong: `toISOString` converts to UTC first, so
 * anything after 21:00 in UTC-3 reports the next day and the form opens on the
 * wrong date. `formatDate` cannot fill this role because a date input rejects
 * `dd/MM/yyyy` outright.
 *
 * A value that is already `yyyy-MM-dd` is returned untouched, and that shortcut
 * is load-bearing rather than an optimisation: `new Date("2026-05-16")` is parsed
 * as **UTC** midnight, which in UTC-3 is the 15th at 21:00, so round-tripping the
 * exact value a backend sent would move it back a day.
 *
 * @example
 * <input type="date" defaultValue={formatDateForInput(order.createdAt)} />
 *
 * Absent input answers `""` here — **not** the em dash the reading formatters
 * use — because that is what an input reads as "no value"; an em dash would
 * arrive as content the user has to delete before typing a date.
 *
 * @param value - ISO string, Date, or `null`/`undefined`.
 * @param options - Text for an absent value; defaults to `""`.
 * @returns The `yyyy-MM-dd` value, or an empty string when the input is invalid —
 *   which is what a date input reads as "no value", unlike `"Invalid Date"`.
 */
export function formatDateForInput(
    value: string | Date | null | undefined,
    options?: FormatFallbackOptions,
): string {
    if (isAbsent(value)) return fallbackText(options, "");
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return "";
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Format an ISO date or Date instance as `yyyy-MM-ddTHH:mm`, the value an
 * `<input type="datetime-local">` accepts.
 *
 * The sibling of {@link formatDateForInput}, and it exists for the same reason:
 * `toISOString().slice(0, 16)` is the reflex and it is wrong. `toISOString`
 * converts to UTC first, so a 22:00 appointment in UTC-3 opens the form on the
 * next day at 01:00 — here the trap costs the hour as well as the date.
 *
 * A value already in `yyyy-MM-ddTHH:mm` is returned untouched. A value carrying
 * a zone (`...Z`, `...-03:00`) deliberately does **not** take that shortcut: it
 * is a different instant from the naive string that looks like it, so it is
 * converted to the local calendar parts the input has to show.
 *
 * Seconds are dropped. A `datetime-local` steps by the minute unless the app
 * sets `step`, so a `:ss` the field cannot represent would be silently discarded
 * on the first edit anyway — truncating here keeps the rendered value and the
 * submitted value the same.
 *
 * @example
 * <input
 *     type="datetime-local"
 *     defaultValue={formatDateTimeForInput(appointment.startsAt)}
 * />
 *
 * @param value - ISO string or Date.
 * @returns The `yyyy-MM-ddTHH:mm` value, or an empty string when the input is
 *   invalid — which is what a datetime input reads as "no value", unlike
 *   `"Invalid Date"`.
 */
export function formatDateTimeForInput(
    value: string | Date | null | undefined,
    options?: FormatFallbackOptions,
): string {
    if (isAbsent(value)) return fallbackText(options, "");
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return "";
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    const hours = `${date.getHours()}`.padStart(2, "0");
    const minutes = `${date.getMinutes()}`.padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Format an ISO date or Date instance as `dd/MM/yyyy HH:mm`.
 *
 * Same contract as {@link formatDate}: absent answers the fallback (`"—"` by
 * default) instead of throwing, and present-but-invalid answers `""`.
 *
 * @param value - ISO string, Date, or `null`/`undefined`.
 * @param options - Text to render when the value is absent.
 * @returns Formatted datetime string, the fallback when absent, or empty string
 *   when the value is present and invalid.
 */
export function formatDateTime(
    value: string | Date | null | undefined,
    options?: FormatFallbackOptions,
): string {
    if (isAbsent(value)) return fallbackText(options);
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return "";
    return dateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export interface FormatPhoneOptions {
    /**
     * Treat the number as a mobile line: insert the mandatory `9` after the area
     * code when it is missing, and group the subscriber part `5+4` from the
     * first digit typed instead of waiting for the eleventh.
     *
     * Default `false`, which keeps the length-based behaviour: `4+4` up to ten
     * digits, `5+4` at eleven.
     */
    mobile?: boolean;
}

/**
 * Apply the Brazilian phone mask `(XX) XXXXX-XXXX` or `(XX) XXXX-XXXX`.
 *
 * By default the grouping is decided by **length**, which is what a field
 * accepting both landlines and mobiles needs.
 *
 * `mobile: true` is for a field that only accepts mobile numbers, and it exists
 * because the default is wrong as an as-you-type mask there. Reading anything up
 * to ten digits as a landline puts the hyphen after the fourth subscriber digit,
 * so a half-typed mobile renders `(11) 9123-4`; it only becomes `(11) 91234-5`
 * once the eleventh digit lands. The separator visibly jumps backwards while the
 * user is still typing. With `mobile`, the same input reads `(11) 91234` and the
 * hyphen never moves. It also inserts the leading `9` every Brazilian mobile
 * carries, so a ten-digit number gets corrected rather than masked as a landline.
 *
 * @param value - Raw digits or partially masked string.
 * @param options - Masking options.
 * @returns Masked phone string.
 *
 * @example
 * formatPhone("1191234");                      // "(11) 9123-4"
 * formatPhone("1191234", { mobile: true });    // "(11) 91234"
 * formatPhone("1112345678", { mobile: true }); // "(11) 91234-5678" — 9 inserted
 */
export function formatPhone(value: string, options: FormatPhoneOptions = {}): string {
    const digits = value.replace(/\D/g, "").slice(0, 11);

    if (!options.mobile) {
        if (digits.length <= 10) {
            return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
        }
        return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
    }

    if (digits.length <= 2) return digits;

    const area = digits.slice(0, 2);
    let subscriber = digits.slice(2);
    if (subscriber[0] !== "9") subscriber = `9${subscriber}`;
    subscriber = subscriber.slice(0, 9);

    const prefix = subscriber.slice(0, 5);
    const suffix = subscriber.slice(5);
    return suffix ? `(${area}) ${prefix}-${suffix}` : `(${area}) ${prefix}`;
}

/**
 * Apply the Brazilian CPF mask `XXX.XXX.XXX-XX`.
 *
 * @param value - Raw digits or partially masked string.
 * @returns Masked CPF string.
 */
export function formatCPF(value: string): string {
    return value
        .replace(/\D/g, "")
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

/** How {@link formatPercent} renders a fraction. */
export interface FormatPercentOptions extends FormatFallbackOptions {
    /**
     * Decimal places to show, fixed (padded as well as truncated).
     *
     * Defaults to `1`, which is what the function always did. Two is the case
     * that produced this option: a confidence of 98,74% and one of 98,7% are the
     * same number on a summary card and two different readings on a detail
     * screen, so the precision belongs to the call site.
     */
    decimals?: number;
    /**
     * How digits past `decimals` are dropped. Defaults to `"round"`, which is
     * what the function always did.
     *
     * `"truncate"` cuts toward zero instead. It exists for model confidence:
     * rounded, 0.99996 at two decimals reads `"100,00%"`, which a user takes as
     * certainty the model never claimed; truncated it reads `"99,99%"`.
     */
    mode?: "round" | "truncate";
}

/**
 * Cut `value` toward zero at `digits` decimal places, without the binary
 * floating-point error of `Math.trunc(value * 10 ** digits)`.
 *
 * The naive form is wrong because the multiplication rounds before the cut:
 * `0.57 * 10000` is `5699.999999999999`, so 57% truncated at two decimals came
 * out as `"56,99%"`. Measured over every fraction `i / 10000` (0 to 1), it
 * answers wrong for 573 of the 10001 values at two decimals, and for 3 of 101
 * at zero decimals (`0.29 * 100` is `28.999999999999996`). Shifting the decimal
 * exponent of the number's shortest round-trip string (`"0.57e4"`) parses to the
 * exact integer instead: zero wrong on the same grids.
 *
 * @param value - A finite number.
 * @param digits - Decimal places to keep.
 * @returns The truncated number, with `-0` normalised to `0` so a tiny negative
 *   never renders as `"-0,0%"`.
 */
function truncateDecimal(value: number, digits: number): number {
    const [mantissa, exponent = "0"] = String(value).split("e");
    const scaled = Math.trunc(Number(`${mantissa}e${Number(exponent) + digits}`));
    return Number(`${scaled}e${-digits}`) + 0;
}

/**
 * Format a fraction (0-1) as a percentage.
 *
 * A non-finite input renders as `"—"` rather than `"NaN%"` or `"∞%"`, which is
 * what `Intl.NumberFormat` produces and what a division by zero upstream puts on
 * the screen. It matches `formatDurationMs`, which already answers that way.
 *
 * @example
 * ```typescript
 * formatPercent(0.9874);                // "98,7%"
 * formatPercent(0.9874, { decimals: 2 }); // "98,74%"
 * formatPercent(0.99996, { decimals: 2 }); // "100,00%"
 * formatPercent(0.99996, { decimals: 2, mode: "truncate" }); // "99,99%"
 * formatPercent(0 / 0);                 // "—"
 * ```
 *
 * @param value - Fraction between 0 and 1.
 * @param options - Rendering options; `decimals` defaults to 1, `mode` to
 *   `"round"`.
 * @returns Formatted percent string, e.g. "12,5%", or `"—"` for a non-finite input.
 */
export function formatPercent(
    value: number | null | undefined,
    options: FormatPercentOptions = {},
): string {
    if (isAbsent(value) || !Number.isFinite(value)) return fallbackText(options);
    const decimals = options.decimals ?? 1;
    const shown = options.mode === "truncate" ? truncateDecimal(value, decimals + 2) : value;
    return numberFormat("pt-BR", {
        style: "percent",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(shown);
}

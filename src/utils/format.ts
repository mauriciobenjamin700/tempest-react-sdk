import { dateTimeFormat, numberFormat } from "@/utils/intl-cache";

/**
 * Format a number as Brazilian Real currency.
 *
 * @param value - The amount in BRL.
 * @returns A locale-formatted string, e.g. "R$ 1.234,56".
 */
export function formatCurrency(value: number): string {
    return numberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/**
 * Format an ISO date or Date instance as `dd/MM/yyyy`.
 *
 * @param value - ISO string or Date.
 * @returns Formatted date string, or empty string when input is invalid.
 */
export function formatDate(value: string | Date): string {
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
 * @param value - ISO string or Date.
 * @returns The `yyyy-MM-dd` value, or an empty string when the input is invalid —
 *   which is what a date input reads as "no value", unlike `"Invalid Date"`.
 */
export function formatDateForInput(value: string | Date): string {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return "";
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Format an ISO date or Date instance as `dd/MM/yyyy HH:mm`.
 *
 * @param value - ISO string or Date.
 * @returns Formatted datetime string, or empty string when input is invalid.
 */
export function formatDateTime(value: string | Date): string {
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

/**
 * Format a fraction (0-1) as a percentage with one decimal.
 *
 * @param value - Fraction between 0 and 1.
 * @returns Formatted percent string, e.g. "12,5%".
 */
export function formatPercent(value: number): string {
    return numberFormat("pt-BR", {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(value);
}

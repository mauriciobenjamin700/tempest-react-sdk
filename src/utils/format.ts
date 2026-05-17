/**
 * Format a number as Brazilian Real currency.
 *
 * @param value - The amount in BRL.
 * @returns A locale-formatted string, e.g. "R$ 1.234,56".
 */
export function formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
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
    return new Intl.DateTimeFormat("pt-BR").format(date);
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
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(date);
}

/**
 * Apply the Brazilian phone mask `(XX) XXXXX-XXXX` or `(XX) XXXX-XXXX`.
 *
 * @param value - Raw digits or partially masked string.
 * @returns Masked phone string.
 */
export function formatPhone(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 10) {
        return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
    }
    return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
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
    return new Intl.NumberFormat("pt-BR", {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(value);
}

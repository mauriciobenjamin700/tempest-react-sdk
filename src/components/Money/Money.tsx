import type { HTMLAttributes } from "react";

export interface MoneyProps extends HTMLAttributes<HTMLSpanElement> {
    /** Amount in the smallest currency unit (e.g. cents). */
    cents: number;
    /** ISO 4217 currency code. Defaults to "BRL". */
    currency?: string;
    /** BCP 47 locale used for formatting. Defaults to "pt-BR". */
    locale?: string;
}

/**
 * Render a monetary amount given in cents as a localized currency string
 * inside a `<span>`.
 *
 * The integer cents are divided by 100 and formatted with `Intl.NumberFormat`.
 *
 * @example
 * <Money cents={1990} />            // "R$ 19,90"
 * <Money cents={500} currency="USD" locale="en-US" /> // "$5.00"
 */
export function Money({ cents, currency = "BRL", locale = "pt-BR", ...props }: MoneyProps) {
    const formatted = new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
    }).format(cents / 100);

    return <span {...props}>{formatted}</span>;
}

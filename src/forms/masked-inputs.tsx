import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { Input, type InputProps } from "@/components/Input";
import { formatCEP, formatCNPJ } from "./br-validators";
import { formatCPF, formatPhone } from "@/utils/format";

type MaskedFieldProps = Omit<InputProps, "value" | "onChange"> & {
    value: string;
    onChange: (value: string) => void;
};

function maskedInput(
    mask: (input: string) => string,
    inputMode: InputHTMLAttributes<HTMLInputElement>["inputMode"] = "numeric",
) {
    return forwardRef<HTMLInputElement, MaskedFieldProps>(function MaskedInput(
        { value, onChange, ...props },
        ref,
    ) {
        return (
            <Input
                {...props}
                ref={ref}
                value={mask(value ?? "")}
                inputMode={inputMode}
                onChange={(event) => onChange(mask(event.target.value))}
            />
        );
    });
}

export const CPFInput = maskedInput(formatCPF);
export const CNPJInput = maskedInput(formatCNPJ);
export const PhoneInput = maskedInput(formatPhone, "tel");
export const CEPInput = maskedInput(formatCEP);

export interface MoneyInputProps extends Omit<InputProps, "value" | "onChange" | "type"> {
    /** Cents (integer). Internally treated as 1/100 of the currency unit. */
    value: number;
    onChange: (cents: number) => void;
    /** Currency code for `Intl.NumberFormat`. Default: `"BRL"`. */
    currency?: string;
    /** Locale for `Intl.NumberFormat`. Default: `"pt-BR"`. */
    locale?: string;
}

function formatCents(cents: number, locale: string, currency: string): string {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

function parseCents(text: string): number {
    const digits = text.replace(/\D/g, "");
    if (!digits) return 0;
    return Number.parseInt(digits, 10);
}

/**
 * Currency-masked input. Stores the value as an integer number of cents to
 * avoid floating-point error. Suitable for `react-hook-form` once you adapt
 * the field to expose cents.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
    { value, onChange, currency = "BRL", locale = "pt-BR", ...props },
    ref,
) {
    return (
        <Input
            {...props}
            ref={ref}
            type="text"
            inputMode="numeric"
            value={formatCents(value || 0, locale, currency)}
            onChange={(event) => onChange(parseCents(event.target.value))}
        />
    );
});

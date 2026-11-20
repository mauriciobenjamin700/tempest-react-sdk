import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { Input, type InputProps } from "@/components/Input";
import { formatCEP, formatCNPJ } from "./br-validators";
import { formatCPF, formatPhone } from "@/utils/format";

/**
 * Props of every masked input.
 *
 * `value` and `onChange` are optional because the primary documented usage is
 * inside `<FormField>`, which supplies both through `cloneElement` — declaring
 * them required made `<FormField name="cpf"><CPFInput /></FormField>` fail to
 * type-check while working perfectly at runtime. Standalone usage still passes
 * both; an uncontrolled input without `onChange` simply reports nothing.
 */
type MaskedFieldProps = Omit<InputProps, "value" | "onChange"> & {
    value?: string;
    onChange?: (value: string) => void;
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
                onChange={(event) => onChange?.(mask(event.target.value))}
            />
        );
    });
}

export const CPFInput = maskedInput(formatCPF);
export const CNPJInput = maskedInput(formatCNPJ);
export const PhoneInput = maskedInput(formatPhone, "tel");
export const CEPInput = maskedInput(formatCEP);

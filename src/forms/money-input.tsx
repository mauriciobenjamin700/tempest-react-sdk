import { forwardRef } from "react";
import { Input, type InputProps } from "@/components/Input";
import { centsToDecimalString } from "@/utils/format";
import { useMoneyMask } from "./money-mask";

/**
 * How `<MoneyInput name>` writes the amount into its hidden input: `"cents"` as
 * the integer (`"1234"`), `"decimal"` in the major unit with a dot (`"12.34"`).
 */
export type MoneyNameFormat = "cents" | "decimal";

/** Props `<MoneyInput>` adds to `<Input>`, whatever its value mode. */
interface MoneyInputOwnProps extends Omit<InputProps, "value" | "onChange" | "type" | "inputMode"> {
    /** Currency code for `Intl.NumberFormat`. Default: `"BRL"`. */
    currency?: string;
    /** Locale for `Intl.NumberFormat`. Default: `"pt-BR"`. */
    locale?: string;
    /**
     * Largest amount accepted, in cents; a digit that would pass it is ignored.
     * Default: `Number.MAX_SAFE_INTEGER`.
     */
    maxCents?: number;
    /**
     * Name of a hidden `<input>` rendered next to the field with the amount
     * unformatted, so a form read through `FormData` gets `"1234"` instead of the
     * visible `"R$ 12,34"`. The visible field carries no `name` of its own.
     */
    name?: string;
    /** Format of the hidden input's value. Default: `"cents"`. */
    nameFormat?: MoneyNameFormat;
}

/**
 * Props of `<MoneyInput>`.
 *
 * Two value modes, chosen by `nullable`, because the change handler's type is
 * what a caller's state setter has to match:
 *
 * - default: `value: number`, `onChange(cents: number)`. Emptying the field
 *   reports `0` and the field shows `R$ 0,00`, exactly as before 0.92.0 — a
 *   `useState(0)` setter keeps compiling and never receives `null`.
 * - `nullable`: `value: number | null`, `onChange(cents: number | null)`. An
 *   emptied field reports `null`, renders empty and shows the placeholder, so
 *   "not informed" stays distinguishable from zero.
 *
 * `value` and `onChange` are optional for the same reason as the other masked
 * inputs: inside `<FormField>` both arrive through `cloneElement`.
 */
export type MoneyInputProps = MoneyInputOwnProps &
    (
        | {
              nullable?: false;
              /** Cents (integer). */
              value?: number;
              onChange?: (cents: number) => void;
          }
        | {
              nullable: true;
              /** Cents (integer), or `null` when not informed. */
              value?: number | null;
              onChange?: (cents: number | null) => void;
          }
    );

/**
 * Bank-app currency input: digits enter from the right as integer cents, the
 * caret stays at the end, a paste keeps only its digits. The amount is an
 * integer number of cents end to end, so no float ever touches it.
 *
 * This is {@link useMoneyMask} inside the SDK's `<Input>` frame (label, helper,
 * error, icons). Spread the hook on your own `<input>` when the field already
 * has its own box.
 *
 * @example
 * ```tsx
 * const [price, setPrice] = useState<number | null>(null);
 * <form>
 *     <MoneyInput nullable value={price} onChange={setPrice} name="price" label="Preço" />
 * </form>;
 * ```
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
    {
        value,
        onChange,
        nullable,
        currency = "BRL",
        locale = "pt-BR",
        maxCents,
        name,
        nameFormat = "cents",
        onFocus,
        onClick,
        onSelect,
        ...props
    },
    ref,
) {
    const cents = nullable ? (value ?? null) : value || 0;
    const report = onChange as ((next: number | null) => void) | undefined;
    const mask = useMoneyMask({
        value: cents,
        onChange: (next) => report?.(nullable ? next : (next ?? 0)),
        maxCents,
        currency,
        locale,
    });
    const hiddenValue =
        cents === null
            ? ""
            : nameFormat === "decimal"
              ? centsToDecimalString(cents)
              : String(cents);

    return (
        <>
            <Input
                {...props}
                {...mask}
                ref={ref}
                onFocus={(event) => {
                    mask.onFocus(event);
                    onFocus?.(event);
                }}
                onClick={(event) => {
                    mask.onClick(event);
                    onClick?.(event);
                }}
                onSelect={(event) => {
                    mask.onSelect(event);
                    onSelect?.(event);
                }}
            />
            {name !== undefined && (
                <input
                    type="hidden"
                    name={name}
                    value={hiddenValue}
                    form={props.form}
                    disabled={props.disabled}
                />
            )}
        </>
    );
});

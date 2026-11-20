import type { ChangeEvent, FocusEvent, MouseEvent, SyntheticEvent } from "react";
import { formatCents } from "@/utils/format";

/**
 * Digits of `Number.MAX_SAFE_INTEGER`. A run longer than this is above every
 * ceiling `centsFromDigits` accepts, so it is cut before `Number()` reads it.
 */
const SAFE_INTEGER_DIGITS = String(Number.MAX_SAFE_INTEGER).length;

/**
 * Read the digits of a masked money field as integer cents, bank-app style:
 * every digit in `text` is a cent position, and punctuation, currency symbols and
 * letters are ignored — so `"1"` is 1 cent, `"R$ 12,34"` is 1234, and a paste of
 * `"R$ 1.234,56 (à vista)"` is 123456.
 *
 * No digit, or only zeros, answers `null`: an emptied field is "not informed",
 * which a form has to be able to tell apart from an amount.
 *
 * A digit that would take the amount past `maxCents` is dropped from the end, so
 * typing past the ceiling leaves the amount where it was instead of wrapping or
 * clamping to a number the user never typed. The ceiling defaults to
 * `Number.MAX_SAFE_INTEGER` — above it `Number` stops holding every integer, and
 * the old `parseInt` path displayed 20 typed digits as `…345.660,00`.
 *
 * @example
 * ```typescript
 * centsFromDigits("1234");          // 1234
 * centsFromDigits("R$ 0,00");       // null
 * centsFromDigits("99999", 10_000); // 9999
 * ```
 *
 * @param text - Whatever the input holds after the edit.
 * @param maxCents - Largest amount accepted, in cents. Default: `Number.MAX_SAFE_INTEGER`.
 * @returns The amount in cents, or `null` when there is none.
 * @throws {RangeError} When `maxCents` is negative or `NaN`.
 */
export function centsFromDigits(
    text: string,
    maxCents: number = Number.MAX_SAFE_INTEGER,
): number | null {
    if (!(maxCents >= 0)) {
        throw new RangeError(`maxCents must be a non-negative number, got ${maxCents}`);
    }
    const ceiling = Math.min(Math.floor(maxCents), Number.MAX_SAFE_INTEGER);
    let digits = text.replace(/\D/g, "").replace(/^0+/, "").slice(0, SAFE_INTEGER_DIGITS);
    while (digits !== "" && Number(digits) > ceiling) digits = digits.slice(0, -1);
    return digits === "" ? null : Number(digits);
}

/** Options of {@link useMoneyMask}. */
export interface UseMoneyMaskOptions {
    /** Amount in integer cents; `null`/`undefined` renders an empty field. */
    value: number | null | undefined;
    /** Receives the new amount in cents, or `null` once every digit is gone. */
    onChange: (cents: number | null) => void;
    /** Largest amount accepted, in cents. Default: `Number.MAX_SAFE_INTEGER`. */
    maxCents?: number;
    /** ISO 4217 currency code. Default: `"BRL"`. */
    currency?: string;
    /** BCP 47 locale. Default: `"pt-BR"`. */
    locale?: string;
}

/** What {@link useMoneyMask} returns: props to spread on any `<input>`. */
export interface MoneyMaskInputProps {
    type: "text";
    inputMode: "numeric";
    value: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onFocus: (event: FocusEvent<HTMLInputElement>) => void;
    onClick: (event: MouseEvent<HTMLInputElement>) => void;
    onSelect: (event: SyntheticEvent<HTMLInputElement>) => void;
}

/**
 * Put a collapsed caret at the end of a focused input.
 *
 * A non-collapsed selection is left alone so select-all followed by a paste or
 * a delete still replaces the whole amount.
 *
 * @param input - The money input.
 */
function keepCaretAtEnd(input: HTMLInputElement): void {
    if (input.ownerDocument.activeElement !== input) return;
    const end = input.value.length;
    if (input.selectionStart !== input.selectionEnd) return;
    if (input.selectionStart === end) return;
    input.setSelectionRange(end, end);
}

/**
 * Same as {@link keepCaretAtEnd}, one frame later — after the browser has
 * finished placing the caret for a focus, or React has written the reformatted
 * value back.
 *
 * @param input - The money input.
 */
function keepCaretAtEndNextFrame(input: HTMLInputElement): void {
    requestAnimationFrame(() => keepCaretAtEnd(input));
}

/**
 * Bank-app money mask for any `<input>`: digits enter from the right as cents
 * (`1` → `R$ 0,01`, `1234` → `R$ 12,34`), Backspace removes the last digit, a
 * paste keeps only its digits, and an emptied field reports `null`.
 *
 * The caret is held at the end. That is what makes the mask bank-style rather
 * than "reformat whatever was typed": with the caret in the middle, a digit typed
 * after the `1` of `R$ 12,34` becomes `R$ 152,34` and Backspace removes the
 * wrong digit (measured in Chromium against the 0.91.0 `<MoneyInput>`).
 *
 * Headless on purpose — `<MoneyInput>` is this hook inside the SDK's `<Input>`
 * frame; spread it on your own `<input>` when the field already has its own box.
 * Nothing here carries a `name`: a form read through `FormData` needs a hidden
 * input holding the cents, which `<MoneyInput name>` renders for you.
 *
 * @example
 * ```tsx
 * const [cents, setCents] = useState<number | null>(null);
 * const mask = useMoneyMask({ value: cents, onChange: setCents, maxCents: 1_000_000 });
 * return <input {...mask} placeholder="R$ 0,00" className="my-field" />;
 * ```
 *
 * @param options - Amount, change handler, ceiling, currency and locale.
 * @returns Props to spread on an `<input>`.
 */
export function useMoneyMask({
    value,
    onChange,
    maxCents,
    currency = "BRL",
    locale = "pt-BR",
}: UseMoneyMaskOptions): MoneyMaskInputProps {
    return {
        type: "text",
        inputMode: "numeric",
        value: formatCents(value, { currency, locale, fallback: "" }),
        onChange: (event) => {
            onChange(centsFromDigits(event.target.value, maxCents));
            keepCaretAtEndNextFrame(event.currentTarget);
        },
        onFocus: (event) => keepCaretAtEndNextFrame(event.currentTarget),
        onClick: (event) => keepCaretAtEnd(event.currentTarget),
        onSelect: (event) => keepCaretAtEnd(event.currentTarget),
    };
}

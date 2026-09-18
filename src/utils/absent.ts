/**
 * What every formatter prints when it has nothing to print.
 *
 * An em dash rather than an empty string, because in a table those are two
 * different claims: a blank cell reads as "this column does not apply here",
 * while `—` reads as "this value is missing". `formatDurationMs` in `/perf` has
 * answered this way since it shipped, and `formatPercent` joined it in 0.65.0;
 * this constant is what stops the third answer from appearing.
 */
export const ABSENT_TEXT = "—";

/** The text a formatter falls back to when the value cannot be rendered. */
export interface FormatFallbackOptions {
    /**
     * Text for a value that is absent (`null`/`undefined`) or unrepresentable
     * (`NaN`, `Infinity`). Defaults to {@link ABSENT_TEXT}.
     *
     * The formatters that feed an `<input>` default to `""` instead, because an
     * input reads an empty string as "no value" and would render an em dash as
     * content the user has to delete.
     */
    fallback?: string;
}

/**
 * Whether a value is absent, i.e. has nothing to format.
 *
 * `null` and `undefined` only. A present-but-unparseable value is a different
 * state, and the formatters keep it distinguishable: an ISO string that is not a
 * date still answers `""`, which is what tells "nobody filled this in" apart
 * from "what they filled in is broken" while reading a log.
 *
 * @param value - Anything a formatter was handed.
 * @returns Whether the formatter should answer with the fallback.
 */
export function isAbsent(value: unknown): value is null | undefined {
    return value === null || value === undefined;
}

/**
 * Resolve the fallback text for a formatter call.
 *
 * @param options - The caller's options, if any.
 * @param defaultText - What this formatter uses when the caller said nothing.
 * @returns The text to render in place of the value.
 */
export function fallbackText(
    options: FormatFallbackOptions | undefined,
    defaultText: string = ABSENT_TEXT,
): string {
    return options?.fallback ?? defaultText;
}

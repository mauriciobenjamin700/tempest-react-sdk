/**
 * The shape every option list in the SDK shares: `Select`, `MultiSelect` and
 * `Combobox` all accept an array of it.
 *
 * `value` is always a `string` here, because that is what a `<select>` hands
 * back in `event.target.value` whatever the option was built from: an option
 * built with the number `0` comes back as the string `"0"`, so a list that kept
 * numbers could never be compared with `===` against what the control emits.
 */
export interface OptionEntry {
    value: string;
    label: string;
}

/**
 * The value {@link withAllOption} gives its entry, exported so the filter code
 * compares against a name instead of a magic string.
 *
 * @example
 * const where = status === ALL_OPTION_VALUE ? {} : { status };
 */
export const ALL_OPTION_VALUE = "all";

const DEFAULT_ALL_OPTION_LABEL = "Todos";

const DEFAULT_EMPTY_OPTION_LABEL = "— Não definido —";

/** The minimum an option needs for the helpers to prepend to its list. */
type OptionLike = { value: string | number; label: string };

/**
 * Turn a `value → label` map into the option list `Select`, `MultiSelect` and
 * `Combobox` take.
 *
 * Every key becomes a string `value` (see {@link OptionEntry} for why), so the
 * result is assignable to `SelectOption[]`, `MultiSelectOption[]` and
 * `ComboboxOption[]` alike.
 *
 * **Order.** A `Map` keeps the order it was written in, always. A plain object
 * does too — **except for integer-like keys**, which JavaScript enumerates first
 * and in ascending order whatever order they were written in
 * (`OrdinaryOwnPropertyKeys`, ECMA-262 §10.1.11.1). Measured in Node 24:
 * `Object.keys({ 5: "Ótimo", 3: "Ok", 1: "Ruim" })` is `["1", "3", "5"]`, and
 * `{ baixa, 10, 2, alta }` enumerates as `["2", "10", "baixa", "alta"]`. When
 * the business order of a numeric scale is not ascending, pass a `Map`.
 *
 * @param source - A record or a `Map` from value to label.
 * @returns A new array, one entry per key, in the order described above.
 *
 * @example
 * const STATUS = { active: "Ativo", paused: "Pausado" };
 * <Select aria-label="Status" variant="chip" options={toOptions(STATUS)} />
 *
 * @example
 * const HUMOR = new Map([[5, "Ótimo"], [3, "Ok"], [1, "Ruim"]]);
 * toOptions(HUMOR); // 5, 3, 1 — the order written
 */
export function toOptions(
    source: Readonly<Record<string, string>> | ReadonlyMap<string | number, string>,
): OptionEntry[] {
    const entries: Iterable<readonly [string | number, string]> =
        source instanceof Map ? source.entries() : Object.entries(source);
    return Array.from(entries, ([value, label]) => ({ value: String(value), label }));
}

/**
 * Prepend the "no filter" entry to an option list.
 *
 * A filter needs this as a real option, not as the select's placeholder: a
 * placeholder reads as "nothing chosen yet", so the screen cannot tell whether
 * the column is filtered. The entry uses {@link ALL_OPTION_VALUE}.
 *
 * @param options - The list to extend. It is not mutated.
 * @param label - The entry's label. Defaults to `"Todos"`.
 * @returns A new array with the entry first.
 */
export function withAllOption<T extends OptionLike>(
    options: readonly T[],
    label: string = DEFAULT_ALL_OPTION_LABEL,
): (T | OptionEntry)[] {
    return [{ value: ALL_OPTION_VALUE, label }, ...options];
}

/**
 * Prepend the empty entry a nullable field needs.
 *
 * Without it a `<select>` has no way to show "unset": a controlled
 * `value=""` with no matching option reads back as the **first option** (measured
 * in jsdom: `select.value === "a"`), so opening an edit form and saving it
 * writes a value nobody chose. `Select`'s `placeholder` does not cover this — its
 * entry is `disabled hidden`, so once something is picked the field can never be
 * cleared again. The entry's value is `""`, which is what an unanswered nullable field
 * submits.
 *
 * @param options - The list to extend. It is not mutated.
 * @param label - The entry's label. Defaults to `"— Não definido —"`.
 * @returns A new array with the entry first.
 */
export function withEmptyOption<T extends OptionLike>(
    options: readonly T[],
    label: string = DEFAULT_EMPTY_OPTION_LABEL,
): (T | OptionEntry)[] {
    return [{ value: "", label }, ...options];
}

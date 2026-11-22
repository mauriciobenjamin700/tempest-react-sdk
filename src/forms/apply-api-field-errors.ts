import type { FieldValues, Path, UseFormGetValues, UseFormSetError } from "react-hook-form";
import { isApiError } from "@/http/errors";

/** The two `useForm` methods {@link applyApiFieldErrors} needs. */
export interface ApiFieldErrorsTarget<TValues extends FieldValues> {
    /** `form.setError`. */
    setError: UseFormSetError<TValues>;
    /** `form.getValues`, read to tell a field of this form from any other name. */
    getValues: UseFormGetValues<TValues>;
}

/** Options of {@link applyApiFieldErrors}. */
export interface ApplyApiFieldErrorsOptions {
    /**
     * The names this form renders. Default: every name whose value
     * `form.getValues(name)` is not `undefined` — which is every field that has a
     * default, the way `useZodForm` is meant to be called. Pass the list when a
     * field starts as `undefined`, or to leave out a field the screen hides.
     */
    fields?: Iterable<string>;
    /** Move focus to the first marked field. Default `true`. */
    focus?: boolean;
}

/** What {@link applyApiFieldErrors} did with `error.fields`. */
export interface ApplyApiFieldErrorsResult {
    /** The field names that received a message, in the order the API sent them. */
    marked: string[];
    /**
     * The messages whose name matched no field of this form, keyed by that name —
     * for the alert or the toast, since no input will ever show them.
     */
    unmatched: Record<string, string>;
}

/**
 * Copy the per-field messages of an API rejection onto the form's fields.
 *
 * A `422` from FastAPI (or a `tempest-fastapi-sdk` error naming `field`) reaches
 * the app as `TempestApiError.fields`, `{ name: message }`. Every form used to
 * copy it by hand with a `setError` loop, and the copies disagreed: one marked
 * every name, so a message for a field the screen does not render sat on an
 * input that does not exist, invisible and unclearable; another filtered by a
 * hard-coded list that drifted from the schema; none moved focus. `AuthForm`
 * had the right rules privately; this is that code, for any form.
 *
 * Only names that belong to the form are marked (see
 * {@link ApplyApiFieldErrorsOptions.fields}); the rest come back in `unmatched`
 * so the caller can show them somewhere visible, written as own properties so a
 * name like `__proto__` stays a key instead of replacing the prototype. Any other error — a network
 * failure, a `500`, a plain `Error` — marks nothing and returns empty.
 *
 * @example
 * onError: (error) => {
 *     const { marked } = applyApiFieldErrors(form, error);
 *     if (marked.length === 0) toast.error(describe(error, "Não foi possível salvar."));
 * }
 *
 * @param form - The `useForm`/`useZodForm` instance, or anything with its
 *   `setError` and `getValues`.
 * @param error - Whatever the request threw.
 * @param options - Which names count as fields, and whether to focus.
 * @returns The names marked and the messages that matched no field.
 */
export function applyApiFieldErrors<TValues extends FieldValues>(
    form: ApiFieldErrorsTarget<TValues>,
    error: unknown,
    options: ApplyApiFieldErrorsOptions = {},
): ApplyApiFieldErrorsResult {
    const result: ApplyApiFieldErrorsResult = { marked: [], unmatched: {} };
    if (!isApiError(error) || !error.fields) return result;
    const { fields, focus = true } = options;
    const names = fields === undefined ? null : new Set(fields);
    for (const [name, message] of Object.entries(error.fields)) {
        const path = name as Path<TValues>;
        const known = names ? names.has(name) : form.getValues(path) !== undefined;
        if (!known) {
            Object.defineProperty(result.unmatched, name, {
                value: message,
                enumerable: true,
                writable: true,
                configurable: true,
            });
            continue;
        }
        form.setError(
            path,
            { type: "server", message },
            { shouldFocus: focus && result.marked.length === 0 },
        );
        result.marked.push(name);
    }
    return result;
}

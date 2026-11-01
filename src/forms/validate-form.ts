import type { z } from "zod";

export interface ValidateFormSuccess<T> {
    success: true;
    data: T;
    errors: Record<string, string>;
}

export interface ValidateFormFailure {
    success: false;
    errors: Record<string, string>;
}

export type ValidateFormResult<T> = ValidateFormSuccess<T> | ValidateFormFailure;

/**
 * Validate `values` against a zod schema and return a per-field error map
 * compatible with most form libraries.
 *
 * Field paths follow zod's `issue.path.join(".")` convention — nested fields
 * become `"address.city"`, array entries `"items.0.name"`. The first issue
 * per path wins (subsequent ones are dropped to keep error UIs tidy).
 *
 * The map is a plain object, but every key is written as an **own** property
 * and looked up with `hasOwnProperty`: with `path in errors` and `errors[path] =`
 * a field named `constructor` or `toString` read as already failed through
 * `Object.prototype` and lost its message, and an issue a `superRefine` files
 * under `__proto__` replaced the map's prototype instead of becoming a key.
 *
 * @param schema - zod schema describing the form shape.
 * @param values - Raw form values (typed as `unknown`).
 * @returns Either `{ success: true, data, errors: {} }` or `{ success: false, errors }`.
 */
export function validateForm<TSchema extends z.ZodTypeAny>(
    schema: TSchema,
    values: unknown,
): ValidateFormResult<z.infer<TSchema>> {
    const result = schema.safeParse(values);
    if (result.success) {
        return { success: true, data: result.data, errors: {} };
    }
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
        const path = issue.path.length === 0 ? "_root" : issue.path.join(".");
        if (!Object.prototype.hasOwnProperty.call(errors, path)) {
            Object.defineProperty(errors, path, {
                value: issue.message,
                enumerable: true,
                writable: true,
                configurable: true,
            });
        }
    }
    return { success: false, errors };
}

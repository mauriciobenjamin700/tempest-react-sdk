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
        if (!(path in errors)) errors[path] = issue.message;
    }
    return { success: false, errors };
}

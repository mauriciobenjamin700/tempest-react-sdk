import type {
    FieldErrors,
    FieldValues,
    Resolver,
    ResolverOptions,
    ResolverResult,
} from "react-hook-form";
import type { z } from "zod";

interface ResolverError {
    type: string;
    message: string;
}

/**
 * Minimal `react-hook-form` resolver built on top of zod. Mirrors the shape
 * produced by `@hookform/resolvers/zod` so it can be passed straight to
 * `useForm({ resolver })`.
 *
 * Typed with react-hook-form's own `Resolver`, not a local look-alike: a
 * structurally similar type of our own compiled fine here and was then rejected
 * at the `useForm({ resolver })` call site — the only place a resolver is ever
 * used — which is why `useZodForm` had to cast its way past it.
 *
 * Of the resolver options only `criteriaMode` is read; the rest of
 * `ResolverOptions` is accepted and ignored, because react-hook-form always
 * passes the whole object.
 *
 * Errors are written as **own** properties and checked with `hasOwnProperty`.
 * A plain `errors[path]` read saw `Object.prototype.constructor` for a field
 * named `constructor`, so `firstError` mode kept the inherited function instead
 * of the message, and an issue a `superRefine` files under `__proto__` replaced
 * the map's prototype instead of adding the field.
 *
 * @example
 * const form = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
 */
export function zodResolver<TSchema extends z.ZodTypeAny>(
    schema: TSchema,
): Resolver<z.infer<TSchema> & FieldValues> {
    type Values = z.infer<TSchema> & FieldValues;

    return async (
        values: Values,
        _context: unknown,
        options: ResolverOptions<Values>,
    ): Promise<ResolverResult<Values>> => {
        const result = schema.safeParse(values);
        if (result.success) {
            return { values: result.data as Values, errors: {} };
        }

        const errors: Record<string, ResolverError | object> = {};
        const criteriaMode = options.criteriaMode ?? "firstError";

        for (const issue of result.error.issues) {
            const path = issue.path.length === 0 ? "_root" : issue.path.join(".");
            if (
                criteriaMode === "firstError" &&
                Object.prototype.hasOwnProperty.call(errors, path)
            ) {
                continue;
            }
            Object.defineProperty(errors, path, {
                value: { type: issue.code, message: issue.message },
                enumerable: true,
                writable: true,
                configurable: true,
            });
        }

        return { values: {}, errors: errors as FieldErrors<Values> };
    };
}

import type { z } from "zod";

interface ResolverError {
    type: string;
    message: string;
}

interface ResolverOutput<T> {
    values: T | object;
    errors: Record<string, ResolverError | object>;
}

type Resolver<T> = (
    values: unknown,
    context: unknown,
    options: { criteriaMode?: "firstError" | "all" },
) => Promise<ResolverOutput<T>>;

/**
 * Minimal `react-hook-form` resolver built on top of zod. Mirrors the shape
 * produced by `@hookform/resolvers/zod` so it can be passed straight to
 * `useForm({ resolver })`.
 *
 * @example
 * const form = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
 */
export function zodResolver<TSchema extends z.ZodTypeAny>(
    schema: TSchema,
): Resolver<z.infer<TSchema>> {
    return async (values, _context, options) => {
        const result = schema.safeParse(values);
        if (result.success) {
            return { values: result.data, errors: {} };
        }

        const errors: Record<string, ResolverError | object> = {};
        const criteriaMode = options.criteriaMode ?? "firstError";

        for (const issue of result.error.issues) {
            const path = issue.path.length === 0 ? "_root" : issue.path.join(".");
            if (criteriaMode === "firstError" && errors[path]) continue;
            errors[path] = { type: issue.code, message: issue.message };
        }

        return { values: {}, errors };
    };
}

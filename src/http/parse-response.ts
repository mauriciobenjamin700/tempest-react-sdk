import type { z } from "zod";

/**
 * Validate an unknown response payload against a zod schema.
 *
 * In development, throws a detailed error pointing at the divergent field.
 * In production, throws a generic error so internals do not leak to users.
 *
 * @param schema - The zod schema to parse against.
 * @param raw - The raw response payload.
 * @param context - A label used in error messages, e.g. "POST /auth/login".
 * @returns The parsed, typed payload.
 */
export function parseResponse<TSchema extends z.ZodTypeAny>(
    schema: TSchema,
    raw: unknown,
    context: string,
): z.infer<TSchema> {
    const result = schema.safeParse(raw);
    if (result.success) {
        return result.data;
    }

    const isDev =
        typeof process !== "undefined" &&
        (process.env?.NODE_ENV === "development" || process.env?.NODE_ENV === "test");

    if (isDev) {
        const issues = result.error.issues
            .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
            .join("\n");
        throw new Error(
            `[parseResponse] Contract drift on ${context}:\n${issues}\n\nRaw payload: ${JSON.stringify(raw, null, 2)}`,
        );
    }
    throw new Error(`Resposta inválida do servidor (${context}).`);
}

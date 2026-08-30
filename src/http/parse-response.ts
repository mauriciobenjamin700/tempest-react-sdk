import type { z } from "zod";

import { isDevBuild } from "../utils/dev-mode";

/**
 * Validate an unknown response payload against a zod schema.
 *
 * A development build throws a detailed error naming every divergent field path
 * and embedding the raw payload; every other build throws a generic sentence, so
 * server internals never reach a user's screen or an error tracker.
 *
 * Which one you get comes from `isDevBuild()`, the SDK's single answer to that
 * question, rather than from a check written here. This function used to ask
 * `typeof process !== "undefined" && process.env?.NODE_ENV === "development"`,
 * and a browser has no `process` identifier at all — so the guard short-circuited
 * and the detailed branch was dead in exactly the build it was written for, no
 * matter what the bundler substituted behind it.
 *
 * The rule `isDevBuild()` applies is `NODE_ENV !== "production"`, which is wider
 * than the old `"development" || "test"`: a staging build that never sets
 * `NODE_ENV=production` gets the drift report, raw payload included.
 *
 * @param schema - The zod schema to parse against.
 * @param raw - The raw response payload.
 * @param context - A label used in error messages, e.g. "POST /auth/login".
 * @returns The parsed, typed payload.
 * @throws Error When the payload does not match the schema: `[parseResponse]
 * Contract drift on <context>` with the field paths and the raw payload in a
 * development build, `Resposta inválida do servidor (<context>).` otherwise.
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

    if (isDevBuild()) {
        const issues = result.error.issues
            .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
            .join("\n");
        throw new Error(
            `[parseResponse] Contract drift on ${context}:\n${issues}\n\nRaw payload: ${JSON.stringify(raw, null, 2)}`,
        );
    }
    throw new Error(`Resposta inválida do servidor (${context}).`);
}

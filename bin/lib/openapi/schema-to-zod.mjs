// JSON Schema (OpenAPI 3.0/3.1 subset) → Zod expression source string.
// Pure + deterministic so the generated output is stable and testable.

/** Convert a $ref like "#/components/schemas/User" to its schema name ("User"). */
export function refName(ref) {
    return ref.slice(ref.lastIndexOf("/") + 1);
}

/** The generated Zod const name for a schema name (e.g. "User" → "UserSchema"). */
export function zodName(name) {
    return `${name}Schema`;
}

function isNullable(schema) {
    if (schema.nullable === true) return true; // OpenAPI 3.0
    if (Array.isArray(schema.type)) return schema.type.includes("null"); // 3.1
    return false;
}

function withModifiers(expr, schema) {
    let out = expr;
    if (isNullable(schema)) out += ".nullable()";
    if (schema.default !== undefined) out += `.default(${JSON.stringify(schema.default)})`;
    return out;
}

/** Pick the primary (non-null) type when 3.1 uses an array of types. */
function primaryType(schema) {
    if (Array.isArray(schema.type)) return schema.type.find((t) => t !== "null");
    return schema.type;
}

/**
 * Convert one schema node to a Zod expression string.
 *
 * @param {object} schema - The (sub)schema.
 * @param {(ref: string) => string} [resolveRef] - Maps a $ref to its Zod expr
 *   (defaults to the bare `${Name}Schema` const, used lazily).
 * @returns {string} A Zod expression, e.g. `z.string().email()`.
 */
export function schemaToZod(schema, resolveRef = (ref) => zodName(refName(ref))) {
    if (!schema || typeof schema !== "object") return "z.unknown()";

    if (schema.$ref) return resolveRef(schema.$ref);

    // Composition.
    if (Array.isArray(schema.allOf)) {
        const parts = schema.allOf.map((s) => schemaToZod(s, resolveRef));
        if (parts.length === 1) return withModifiers(parts[0], schema);
        return withModifiers(
            parts.reduce((a, b) => `z.intersection(${a}, ${b})`),
            schema,
        );
    }
    if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
        const variants = (schema.anyOf ?? schema.oneOf).map((s) => schemaToZod(s, resolveRef));
        const union = variants.length === 1 ? variants[0] : `z.union([${variants.join(", ")}])`;
        return withModifiers(union, schema);
    }

    // Standalone enum (no explicit object/array type).
    if (Array.isArray(schema.enum)) {
        const allStrings = schema.enum.every((v) => typeof v === "string");
        const expr = allStrings
            ? `z.enum([${schema.enum.map((v) => JSON.stringify(v)).join(", ")}])`
            : `z.union([${schema.enum.map((v) => `z.literal(${JSON.stringify(v)})`).join(", ")}])`;
        return withModifiers(expr, schema);
    }

    switch (primaryType(schema)) {
        case "string": {
            let e = "z.string()";
            if (schema.format === "email") e += ".email()";
            else if (schema.format === "uuid") e += ".uuid()";
            else if (schema.format === "uri" || schema.format === "url") e += ".url()";
            else if (schema.format === "date-time") e = "z.string().datetime({ offset: true })";
            if (typeof schema.minLength === "number") e += `.min(${schema.minLength})`;
            if (typeof schema.maxLength === "number") e += `.max(${schema.maxLength})`;
            if (typeof schema.pattern === "string")
                e += `.regex(/${schema.pattern.replace(/\//g, "\\/")}/)`;
            return withModifiers(e, schema);
        }
        case "integer":
        case "number": {
            let e = "z.number()";
            if (primaryType(schema) === "integer") e += ".int()";
            if (typeof schema.minimum === "number") e += `.min(${schema.minimum})`;
            if (typeof schema.maximum === "number") e += `.max(${schema.maximum})`;
            return withModifiers(e, schema);
        }
        case "boolean":
            return withModifiers("z.boolean()", schema);
        case "null":
            return "z.null()";
        case "array": {
            const items = schema.items ? schemaToZod(schema.items, resolveRef) : "z.unknown()";
            return withModifiers(`z.array(${items})`, schema);
        }
        case "object":
        default: {
            if (schema.properties && typeof schema.properties === "object") {
                const required = new Set(schema.required ?? []);
                const entries = Object.entries(schema.properties).map(([key, prop]) => {
                    let expr = schemaToZod(prop, resolveRef);
                    if (!required.has(key)) expr += ".optional()";
                    return `    ${JSON.stringify(key)}: ${expr},`;
                });
                let e = entries.length ? `z.object({\n${entries.join("\n")}\n})` : "z.object({})";
                // additionalProperties → passthrough / record.
                if (schema.additionalProperties === true) e += ".passthrough()";
                return withModifiers(e, schema);
            }
            if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
                return withModifiers(
                    `z.record(${schemaToZod(schema.additionalProperties, resolveRef)})`,
                    schema,
                );
            }
            // No type info → unknown record / passthrough object.
            return withModifiers("z.record(z.unknown())", schema);
        }
    }
}

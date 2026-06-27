// OpenAPI 3.x → per-tag { schemas.ts (Zod), types.ts, service.ts (class) }.
// Pure: takes the parsed spec object, returns a { path: contents } map. No I/O.
import { refName, zodName, schemaToZod } from "./schema-to-zod.mjs";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

/** Slug a tag into a folder/identifier-safe base ("User Profiles" → "user-profiles"). */
function tagSlug(tag) {
    return (
        tag
            .trim()
            .replace(/[^a-zA-Z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .toLowerCase() || "default"
    );
}

/** PascalCase for class names ("user-profiles" → "UserProfiles"). */
function pascal(s) {
    return s.replace(/(^|[^a-zA-Z0-9])([a-zA-Z0-9])/g, (_, _b, ch) => ch.toUpperCase());
}

/** camelCase method name from operationId or method+path. */
function methodName(op, method, path) {
    if (op.operationId) {
        const id = op.operationId.replace(/[^a-zA-Z0-9]+(.)?/g, (_, ch) =>
            ch ? ch.toUpperCase() : "",
        );
        return id.charAt(0).toLowerCase() + id.slice(1);
    }
    const parts = path
        .split("/")
        .filter(Boolean)
        .map((p) => p.replace(/[{}]/g, ""));
    return method + parts.map((p) => pascal(p)).join("");
}

/** Collect component-schema names referenced (transitively) by a schema node. */
function collectRefs(node, schemas, acc = new Set(), seen = new Set()) {
    if (!node || typeof node !== "object") return acc;
    if (node.$ref) {
        const name = refName(node.$ref);
        if (!acc.has(name)) {
            acc.add(name);
            if (!seen.has(name)) {
                seen.add(name);
                collectRefs(schemas[name], schemas, acc, seen);
            }
        }
        return acc;
    }
    for (const v of Object.values(node)) {
        if (v && typeof v === "object") collectRefs(v, schemas, acc, seen);
    }
    return acc;
}

/** TS type expression for a schema node (uses generated type names for $refs). */
function tsType(schema) {
    if (!schema || typeof schema !== "object") return "unknown";
    if (schema.$ref) return refName(schema.$ref);
    if (schema.allOf) return schema.allOf.map(tsType).join(" & ");
    if (schema.anyOf || schema.oneOf) {
        const parts = (schema.anyOf ?? schema.oneOf).map(tsType);
        return [...new Set(parts)].join(" | ");
    }
    const t = Array.isArray(schema.type) ? schema.type.find((x) => x !== "null") : schema.type;
    const nul = (Array.isArray(schema.type) && schema.type.includes("null")) || schema.nullable;
    let base;
    switch (t) {
        case "string":
            base = Array.isArray(schema.enum)
                ? schema.enum.map((v) => JSON.stringify(v)).join(" | ")
                : "string";
            break;
        case "integer":
        case "number":
            base = "number";
            break;
        case "boolean":
            base = "boolean";
            break;
        case "null":
            return "null";
        case "array":
            base = `${tsType(schema.items)}[]`;
            break;
        case "object":
        default:
            base = "Record<string, unknown>";
    }
    return nul ? `${base} | null` : base;
}

/**
 * TS type for a query-param value. Query params serialize to strings, so the
 * client only accepts `string | number | boolean | null`. Anything richer
 * (objects, arrays of objects) is narrowed to `string` to stay assignable.
 */
function queryParamType(schema) {
    const t = tsType(schema ?? { type: "string" });
    const allowed = new Set(["string", "number", "boolean", "null"]);
    const ok = t.split("|").every((part) => allowed.has(part.trim()));
    return ok ? t : "string";
}

/** Turn a tag slug into a JS-safe identifier ("chat-messages" → "chatMessages"). */
function slugIdent(slug) {
    const id = slug.replace(/[^a-zA-Z0-9]+(.)?/g, (_, ch) => (ch ? ch.toUpperCase() : ""));
    return /^[a-zA-Z_]/.test(id) ? id : `_${id}`;
}

/** Topologically sort schema names so dependencies are declared first. */
function topoSort(names, schemas) {
    const sorted = [];
    const visited = new Set();
    const onStack = new Set();
    const cyclic = new Set();
    function visit(name) {
        if (visited.has(name)) return;
        if (onStack.has(name)) {
            cyclic.add(name);
            return;
        }
        onStack.add(name);
        const deps = collectRefs(schemas[name], schemas, new Set(), new Set([name]));
        for (const d of deps) if (names.has(d) && d !== name) visit(d);
        onStack.delete(name);
        visited.add(name);
        sorted.push(name);
    }
    for (const n of [...names].sort()) visit(n);
    return { sorted, cyclic };
}

/** Follow a chain of $refs to the concrete schema node. */
function resolveSchema(schema, schemas) {
    let node = schema;
    let guard = 0;
    while (node && node.$ref && guard++ < 16) node = schemas[refName(node.$ref)];
    return node;
}

/**
 * Detect a Tempest pagination envelope and return its kind + item type.
 *
 * Offset (fastapi-pagination `Page` / `BasePaginationSchema`):
 *   items + total + pages + (size | page_size).
 * Cursor (`CursorPaginationSchema`): items + next_cursor + has_more.
 *
 * @returns {{ kind: "offset"|"cursor", itemType: string }|null}
 */
function detectPage(schema, schemas) {
    const node = resolveSchema(schema, schemas);
    const props = node?.properties;
    if (!props || !props.items || resolveSchema(props.items, schemas)?.type !== "array") {
        return null;
    }
    const itemType = tsType(resolveSchema(props.items, schemas).items);
    if ("total" in props && "pages" in props && ("size" in props || "page_size" in props)) {
        return { kind: "offset", itemType };
    }
    if ("next_cursor" in props && "has_more" in props) {
        return { kind: "cursor", itemType };
    }
    return null;
}

/** Extract the success ($2xx) JSON response schema of an operation. */
function successSchema(op) {
    const responses = op.responses ?? {};
    const code =
        ["200", "201", "202", "2XX"].find((c) => responses[c]) ??
        Object.keys(responses).find((c) => c.startsWith("2"));
    const content = code && responses[code]?.content?.["application/json"];
    return content?.schema ?? null;
}

/** Extract the JSON request body schema of an operation. */
function bodySchema(op) {
    return op.requestBody?.content?.["application/json"]?.schema ?? null;
}

/**
 * Generate the per-tag files from a parsed OpenAPI document.
 *
 * @param {object} doc - The parsed OpenAPI 3.x spec.
 * @returns {{ files: Record<string, string>, tags: string[] }}
 */
export function generate(doc) {
    const schemas = doc.components?.schemas ?? {};
    const groups = new Map(); // slug → { tag, ops: [...] }

    for (const [path, item] of Object.entries(doc.paths ?? {})) {
        for (const method of HTTP_METHODS) {
            const op = item[method];
            if (!op) continue;
            const tag = op.tags?.[0] ?? "default";
            const slug = tagSlug(tag);
            if (!groups.has(slug)) groups.set(slug, { tag, slug, ops: [] });
            groups.get(slug).ops.push({ method, path, op });
        }
    }

    const files = {};
    const tags = [];

    for (const { tag, slug, ops } of groups.values()) {
        tags.push(tag);
        const Class = `${pascal(slug)}Service`;

        // 1. Which component schemas does this group touch (transitively)?
        const used = new Set();
        for (const { op } of ops) {
            const b = bodySchema(op);
            const r = successSchema(op);
            if (b) collectRefs(b, schemas, used);
            if (r) collectRefs(r, schemas, used);
        }
        const { sorted, cyclic } = topoSort(used, schemas);

        // 2. schemas.ts
        const schemaLines = sorted.map((name) => {
            const expr = schemaToZod(schemas[name], (ref) => {
                const n = refName(ref);
                return cyclic.has(n) ? `z.lazy(() => ${zodName(n)})` : zodName(n);
            });
            return `export const ${zodName(name)} = ${expr};`;
        });
        files[`${slug}/schemas.ts`] = `import { z } from "zod";\n\n${schemaLines.join("\n\n")}\n`;

        // 3. types.ts
        const typeLines = sorted.map(
            (name) => `export type ${name} = z.infer<typeof S.${zodName(name)}>;`,
        );
        files[`${slug}/types.ts`] =
            `import type { z } from "zod";\n\nimport * as S from "./schemas";\n\n${typeLines.join("\n")}\n`;

        // 4. service.ts
        const usedNames = new Set();
        const methods = ops.map(({ method, path, op }) =>
            emitMethod(method, path, op, schemas, usedNames),
        );
        const usedTypeNames = [...used].sort();
        const typeImport = usedTypeNames.length
            ? `import type { ${usedTypeNames.join(", ")} } from "./types";\n`
            : "";
        const schemaImport = usedTypeNames.length ? `import * as S from "./schemas";\n` : "";
        const body = methods.join("\n\n");
        // Pagination envelopes are re-exported from the SDK; import what we used.
        const sdkTypes = ["ApiClient"];
        if (body.includes("OffsetPage<")) sdkTypes.push("OffsetPage");
        if (body.includes("CursorPage<")) sdkTypes.push("CursorPage");
        files[`${slug}/service.ts`] =
            `import type { ${sdkTypes.join(", ")} } from "tempest-react-sdk";\n\n` +
            schemaImport +
            typeImport +
            `\n/** Generated service for the "${tag}" routes. Inject an ApiClient (createApiClient). */\n` +
            `export class ${Class} {\n` +
            `    constructor(private readonly api: ApiClient) {}\n\n` +
            body +
            `\n}\n`;

        // 5. index.ts (re-export)
        files[`${slug}/index.ts`] =
            `export * from "./schemas";\nexport * from "./types";\nexport { ${Class} } from "./service";\n`;
    }

    // Root barrel — namespaced per group so schema/type names shared across
    // groups (e.g. UserResponseSchema in both `admin` and `auth`) don't collide.
    files["index.ts"] =
        [...groups.values()]
            .map(({ slug }) => `export * as ${slugIdent(slug)} from "./${slug}";`)
            .join("\n") + "\n";

    return { files, tags };
}

/** Emit a single class method for one operation. */
function emitMethod(method, path, op, schemas, usedNames = new Set()) {
    let name = methodName(op, method, path);
    // Dedupe collisions within a group (e.g. operationIds "home__get" / "home_get").
    if (usedNames.has(name)) {
        let n = 2;
        while (usedNames.has(`${name}${n}`)) n += 1;
        name = `${name}${n}`;
    }
    usedNames.add(name);
    const pathParams = (op.parameters ?? []).filter((p) => p.in === "path");
    const queryParams = (op.parameters ?? []).filter((p) => p.in === "query");
    const body = bodySchema(op);
    const resp = successSchema(op);
    // Map a Tempest pagination envelope to OffsetPage<T>/CursorPage<T>.
    const page = resp ? detectPage(resp, schemas) : null;
    const retType = page
        ? `${page.kind === "offset" ? "OffsetPage" : "CursorPage"}<${page.itemType}>`
        : resp
          ? tsType(resp)
          : "void";

    const args = [];
    for (const p of pathParams) args.push(`${p.name}: ${tsType(p.schema ?? { type: "string" })}`);
    if (body) args.push(`body: ${tsType(body)}`);
    if (queryParams.length) {
        const q = queryParams
            .map(
                (p) =>
                    `${JSON.stringify(p.name)}${p.required ? "" : "?"}: ${queryParamType(p.schema)}`,
            )
            .join("; ");
        args.push(`params: { ${q} }`);
    }

    // Interpolate path params into a template literal.
    const tpl = path.replace(/{([^}]+)}/g, (_, n) => "${" + n + "}");
    const url = pathParams.length ? `\`${tpl}\`` : JSON.stringify(path);

    const callOpts = [];
    if (body) callOpts.push("body");
    if (queryParams.length) callOpts.push("params");
    const optsArg = callOpts.length ? `, { ${callOpts.join(", ")} }` : "";

    // Zod input validation: validate the body when it references a known schema.
    let validation = "";
    if (body && body.$ref) {
        const schemaConst = `S.${zodName(refName(body.$ref))}`;
        validation = `        ${schemaConst}.parse(body);\n`;
    }

    const ret = retType === "void" ? "Promise<void>" : `Promise<${retType}>`;
    const generic = retType === "void" ? "" : `<${retType}>`;
    return (
        `    /** \`${method.toUpperCase()} ${path}\`${op.summary ? ` — ${op.summary}` : ""} */\n` +
        `    async ${name}(${args.join(", ")}): ${ret} {\n` +
        validation +
        `        return this.api.${method}${generic}(${url}${optsArg});\n` +
        `    }`
    );
}

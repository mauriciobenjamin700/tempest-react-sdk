// OpenAPI 3.x → per-tag { schemas.ts (Zod), types.ts, service.ts (class) }.
// Pure: takes the parsed spec object, returns a { path: contents } map. No I/O.
import { assertNoCollision, commentText, toIdentifier, urlTemplate } from "./escape.mjs";
import { refName, schemaToZod, typeName, zodName } from "./schema-to-zod.mjs";

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

/**
 * camelCase method name from operationId or method+path.
 *
 * The result only ever holds `[a-zA-Z0-9]`, so it cannot carry code; an
 * operationId that sanitizes to nothing, or to a leading digit, falls back to
 * the method+path name and is otherwise prefixed with `_` to stay an identifier.
 */
function methodName(op, method, path) {
    if (typeof op.operationId === "string") {
        const id = op.operationId.replace(/[^a-zA-Z0-9]+(.)?/g, (_, ch) =>
            ch ? ch.toUpperCase() : "",
        );
        if (/^[a-zA-Z]/.test(id)) return id.charAt(0).toLowerCase() + id.slice(1);
    }
    const parts = path
        .split("/")
        .filter(Boolean)
        .map((p) => pascal(p).replace(/[^a-zA-Z0-9]/g, ""));
    return method + parts.join("");
}

/**
 * Member names every generated service class already has: the constructor and the
 * injected `api` property. An operation whose method name lands on one of them is
 * deduplicated like any other collision (`constructor2`, `api2`).
 */
const CLASS_MEMBERS = ["constructor", "api"];

/**
 * Names a generated method body uses besides its path parameters: the `body` and
 * `params` arguments, the `S` schemas import and the `encodeIdSegment` import. A
 * path parameter that maps to one of them becomes `<name>Param` (`{body}` →
 * `bodyParam`), so it neither duplicates an argument nor shadows the import.
 */
const METHOD_LOCALS = new Set(["body", "params", "S", "encodeIdSegment"]);

/**
 * Whether a path parameter's schema only ever produces a `string` or a `number` —
 * the types `encodeIdSegment(id: string | number)` accepts — so the generated call
 * can pass the argument as is.
 *
 * `$ref` chains are followed, and `anyOf`/`oneOf`/single-member `allOf` qualify
 * when every branch does. `null`, `boolean`, arrays, objects and anything
 * unrecognised do not.
 *
 * @param {object | undefined} schema - The parameter's schema.
 * @param {Record<string, object>} schemas - `components.schemas`.
 * @param {number} [depth] - Recursion guard for self-referencing unions.
 * @returns {boolean} `true` when the TypeScript type is assignable to `string | number`.
 */
function isSegmentScalar(schema, schemas, depth = 0) {
    const node = resolveSchema(schema, schemas);
    if (!node || typeof node !== "object" || depth > 16) return false;
    const branches = node.anyOf ?? node.oneOf ?? (node.allOf?.length === 1 ? node.allOf : null);
    if (branches) return branches.every((b) => isSegmentScalar(b, schemas, depth + 1));
    if (node.nullable || Array.isArray(node.type)) return false;
    return node.type === "string" || node.type === "integer" || node.type === "number";
}

/**
 * Check every `pattern` in a schema compiles as a JavaScript regex.
 *
 * The generated Zod schema builds it with `new RegExp(...)` when the module is
 * imported, so an invalid one would only surface in the app at runtime — a blank
 * screen. Failing here names the schema and where in it the pattern sits.
 *
 * @param {unknown} node - The schema (sub)node.
 * @param {string} schema - The component schema name, for the error.
 * @param {string[]} [at] - Keys from the schema root to `node`.
 * @throws {Error} When a pattern does not compile.
 */
function assertPatterns(node, schema, at = []) {
    if (!node || typeof node !== "object") return;
    if (typeof node.pattern === "string") {
        try {
            new RegExp(node.pattern);
        } catch (err) {
            throw new Error(
                `OpenAPI schema ${JSON.stringify(schema)} at ${at.join(".") || "(root)"}: pattern ${JSON.stringify(node.pattern)} is not a valid JavaScript regular expression (${err.message}).`,
            );
        }
    }
    for (const [key, value] of Object.entries(node)) {
        if (key !== "pattern") assertPatterns(value, schema, [...at, key]);
    }
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

/**
 * TS type expression for a schema node (uses generated type names for $refs).
 *
 * Every component schema the expression names is added to `refs`, so the caller
 * imports exactly the types its signatures mention: a path parameter typed by a
 * `$ref` used to print `kind: Kind` without importing `Kind` (#504), and a page
 * envelope or a nested schema used to be imported without being mentioned, which
 * the template's `unused-imports/no-unused-imports` and `noUnusedLocals` reject
 * (#505).
 *
 * @param {object | undefined} schema - The schema node.
 * @param {Set<string>} [refs] - Collects the spec names of the referenced schemas.
 * @returns {string} The TypeScript type expression.
 */
function tsType(schema, refs = new Set()) {
    if (!schema || typeof schema !== "object") return "unknown";
    if (schema.$ref) {
        const name = refName(schema.$ref);
        refs.add(name);
        return typeName(name);
    }
    if (schema.allOf) return schema.allOf.map((s) => tsType(s, refs)).join(" & ");
    if (schema.anyOf || schema.oneOf) {
        const parts = (schema.anyOf ?? schema.oneOf).map((s) => tsType(s, refs));
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
            base = `${tsType(schema.items, refs)}[]`;
            break;
        case "object":
        default:
            base = "Record<string, unknown>";
    }
    return nul ? `${base} | null` : base;
}

/** JSON Schema types whose TypeScript type the client's `params` values accept. */
const QUERY_SCALARS = new Set(["string", "integer", "number", "boolean", "null"]);

/**
 * Whether a query parameter's schema only ever produces a value the client's
 * `params` accepts (`string | number | boolean | null`).
 *
 * `$ref` chains are followed, so an enum declared in `components/schemas` keeps
 * its name in the signature instead of being narrowed to `string`; unions qualify
 * when every branch does.
 *
 * @param {object | undefined} schema - The parameter's schema.
 * @param {Record<string, object>} schemas - `components.schemas`.
 * @param {number} [depth] - Recursion guard for self-referencing unions.
 * @returns {boolean} `true` when the TypeScript type is assignable to the client's `params` values.
 */
function isQueryScalar(schema, schemas, depth = 0) {
    const node = resolveSchema(schema, schemas);
    if (!node || typeof node !== "object" || depth > 16) return false;
    const branches = node.anyOf ?? node.oneOf ?? (node.allOf?.length === 1 ? node.allOf : null);
    if (branches) return branches.every((b) => isQueryScalar(b, schemas, depth + 1));
    const types = Array.isArray(node.type) ? node.type : [node.type];
    return types.every((t) => QUERY_SCALARS.has(t));
}

/**
 * TS type for a query-param value. Query params serialize to strings, so the
 * client only accepts `string | number | boolean | null`. Anything richer
 * (objects, arrays) is narrowed to `string` to stay assignable.
 *
 * @param {object | undefined} schema - The parameter's schema.
 * @param {Record<string, object>} schemas - `components.schemas`.
 * @param {Set<string>} refs - Collects the schemas the type names.
 * @returns {string} The TypeScript type expression.
 */
function queryParamType(schema, schemas, refs) {
    const node = schema ?? { type: "string" };
    return isQueryScalar(node, schemas) ? tsType(node, refs) : "string";
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
 * @param {object} schema - The success response schema.
 * @param {Record<string, object>} schemas - `components.schemas`.
 * @param {Set<string>} [refs] - Collects the schemas the item type names.
 * @returns {{ kind: "offset"|"cursor", itemType: string }|null}
 */
function detectPage(schema, schemas, refs = new Set()) {
    const node = resolveSchema(schema, schemas);
    const props = node?.properties;
    if (!props || !props.items || resolveSchema(props.items, schemas)?.type !== "array") {
        return null;
    }
    const offset =
        "total" in props && "pages" in props && ("size" in props || "page_size" in props);
    const cursor = "next_cursor" in props && "has_more" in props;
    if (!offset && !cursor) return null;
    const itemType = tsType(resolveSchema(props.items, schemas).items, refs);
    return { kind: offset ? "offset" : "cursor", itemType };
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
 * Contents of a `schemas.ts` / `types.ts` for a group whose routes reference no
 * component schema. The file still exists so every group has the same layout and
 * `index.ts` re-exports it unconditionally, but it imports nothing: an unused `z`
 * or `S` fails the template's lint and `noUnusedLocals` (#505).
 */
const EMPTY_MODULE = "export {};\n";

/**
 * Collator `eslint-plugin-simple-import-sort` orders import sources and
 * specifiers with. Ported from eslint-plugin-simple-import-sort's `compare`
 * (`shared.js`, v14).
 */
const IMPORT_COLLATOR = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/**
 * Order two import sources or specifiers the way the template's
 * `simple-import-sort` rules do, so the generated imports and barrels pass them
 * without an autofix. Ported from eslint-plugin-simple-import-sort's `compare`
 * (`shared.js`, v14): case-insensitive and numeric-aware, with a code-unit
 * tie-break.
 *
 * @param {string} a - First name.
 * @param {string} b - Second name.
 * @returns {number} Negative when `a` sorts first, positive when `b` does.
 */
function compareNames(a, b) {
    return IMPORT_COLLATOR.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Generate the per-tag files from a parsed OpenAPI document.
 *
 * Each group gets `schemas.ts` (Zod, for every component schema its bodies,
 * responses and parameters reach transitively), `types.ts`, `service.ts` and an
 * `index.ts`; the root barrel re-exports each group as a namespace so a schema
 * name shared by two groups does not collide. `service.ts` imports only what its
 * signatures and bodies use — the types they name, `S` when a body is validated,
 * the pagination envelopes and `encodeIdSegment` when they appear — and every
 * import and re-export is emitted in the order the `create-tempest-app`
 * template's ESLint enforces, so the output passes its lint and `tsc` with
 * `noUnusedLocals` as generated (#504, #505).
 *
 * @param {object} doc - The parsed OpenAPI 3.x spec.
 * @returns {{ files: Record<string, string>, tags: string[] }}
 */
export function generate(doc) {
    const schemas = doc.components?.schemas ?? {};
    assertNoCollision(
        Object.keys(schemas).map((n) => [n, typeName(n)]),
        "schema names",
    );
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

    assertNoCollision(
        [...groups.keys()].map((slug) => [slug, slugIdent(slug)]),
        "tags (as barrel names)",
    );

    const files = {};
    const tags = [];

    for (const { tag, slug, ops } of groups.values()) {
        tags.push(tag);
        const Class = `${slugIdent(pascal(slug))}Service`;

        const usedNames = new Set(CLASS_MEMBERS);
        const signature = { refs: new Set(), validates: false };
        const methods = ops.map(({ method, path, op }) =>
            emitMethod(method, path, op, schemas, usedNames, signature),
        );

        const used = new Set();
        for (const { op } of ops) {
            const b = bodySchema(op);
            const r = successSchema(op);
            if (b) collectRefs(b, schemas, used);
            if (r) collectRefs(r, schemas, used);
        }
        for (const name of signature.refs) collectRefs({ $ref: name }, schemas, used);
        const { sorted, cyclic } = topoSort(used, schemas);
        for (const name of sorted) assertPatterns(schemas[name], name);

        const schemaLines = sorted.map((name) => {
            const expr = schemaToZod(schemas[name], (ref) => {
                const n = refName(ref);
                return cyclic.has(n) ? `z.lazy(() => ${zodName(n)})` : zodName(n);
            });
            return `export const ${zodName(name)} = ${expr};`;
        });
        files[`${slug}/schemas.ts`] = sorted.length
            ? `import { z } from "zod";\n\n${schemaLines.join("\n\n")}\n`
            : EMPTY_MODULE;

        const typeLines = sorted.map(
            (name) => `export type ${typeName(name)} = z.infer<typeof S.${zodName(name)}>;`,
        );
        files[`${slug}/types.ts`] = sorted.length
            ? `import type { z } from "zod";\n\nimport type * as S from "./schemas";\n\n${typeLines.join("\n")}\n`
            : EMPTY_MODULE;

        const body = methods.join("\n\n");
        const sdkTypes = ["ApiClient"];
        if (body.includes("OffsetPage<")) sdkTypes.push("OffsetPage");
        if (body.includes("CursorPage<")) sdkTypes.push("CursorPage");
        const packageImports = [
            `import type { ${sdkTypes.sort(compareNames).join(", ")} } from "tempest-react-sdk";`,
        ];
        if (body.includes("encodeIdSegment(")) {
            packageImports.push(`import { encodeIdSegment } from "tempest-react-sdk";`);
        }
        const localImports = [];
        if (signature.validates) localImports.push(`import * as S from "./schemas";`);
        const signatureTypes = [...signature.refs].map(typeName).sort(compareNames);
        if (signatureTypes.length) {
            localImports.push(`import type { ${signatureTypes.join(", ")} } from "./types";`);
        }
        files[`${slug}/service.ts`] =
            [packageImports, localImports]
                .filter((group) => group.length)
                .map((group) => group.join("\n"))
                .join("\n\n") +
            `\n\n/** Generated service for the "${commentText(tag)}" routes. Inject an ApiClient (createApiClient). */\n` +
            `export class ${Class} {\n` +
            `    constructor(private readonly api: ApiClient) {}\n\n` +
            body +
            `\n}\n`;

        files[`${slug}/index.ts`] =
            `export * from "./schemas";\nexport { ${Class} } from "./service";\nexport * from "./types";\n`;
    }

    files["index.ts"] =
        [...groups.values()]
            .map(({ slug }) => slug)
            .sort((a, b) => compareNames(`./${a}`, `./${b}`))
            .map((slug) => `export * as ${slugIdent(slug)} from "./${slug}";`)
            .join("\n") + "\n";

    return { files, tags };
}

/**
 * Emit a single class method for one operation.
 *
 * A method name already taken in the group is deduplicated with a numeric suffix
 * (operationIds `home__get` / `home_get` → `homeGet`, `homeGet2`). A Tempest
 * pagination envelope maps to `OffsetPage<T>` / `CursorPage<T>`, and a body typed
 * by a `$ref` is validated with its Zod schema before the call.
 *
 * @param {string} method - The HTTP method, lower case.
 * @param {string} path - The OpenAPI path template.
 * @param {object} op - The operation object.
 * @param {Record<string, object>} schemas - `components.schemas`.
 * @param {Set<string>} usedNames - Member names already taken in the class.
 * @param {{ refs: Set<string>, validates: boolean }} signature - Collects the
 *   component schemas the emitted types name, and whether `S` was used.
 * @returns {string} The method source.
 */
function emitMethod(method, path, op, schemas, usedNames, signature) {
    let name = methodName(op, method, path);
    if (usedNames.has(name)) {
        let n = 2;
        while (usedNames.has(`${name}${n}`)) n += 1;
        name = `${name}${n}`;
    }
    usedNames.add(name);
    const pathParams = (op.parameters ?? []).filter((p) => p.in === "path");
    const where = `${method.toUpperCase()} ${path}`;
    const paramId = (name) => {
        const id = toIdentifier(name, "camel", `path parameter in ${where}`);
        return METHOD_LOCALS.has(id) ? `${id}Param` : id;
    };
    const paramIds = new Map(pathParams.map((p) => [p.name, paramId(p.name)]));
    const segmentArgs = new Map(
        pathParams.map((p) => {
            const id = paramIds.get(p.name);
            const schema = p.schema ?? { type: "string" };
            return [p.name, isSegmentScalar(schema, schemas) ? id : `${id} as never`];
        }),
    );
    assertNoCollision(
        [
            ...[...paramIds],
            ...(bodySchema(op) ? [["the request body argument", "body"]] : []),
            ...((op.parameters ?? []).some((p) => p.in === "query")
                ? [["the query argument", "params"]]
                : []),
        ],
        `method arguments of ${where}`,
    );
    const queryParams = (op.parameters ?? []).filter((p) => p.in === "query");
    const body = bodySchema(op);
    const resp = successSchema(op);
    const page = resp ? detectPage(resp, schemas, signature.refs) : null;
    const retType = page
        ? `${page.kind === "offset" ? "OffsetPage" : "CursorPage"}<${page.itemType}>`
        : resp
          ? tsType(resp, signature.refs)
          : "void";

    const args = [];
    for (const p of pathParams) {
        args.push(
            `${paramIds.get(p.name)}: ${tsType(p.schema ?? { type: "string" }, signature.refs)}`,
        );
    }
    if (body) args.push(`body: ${tsType(body, signature.refs)}`);
    if (queryParams.length) {
        const q = queryParams
            .map(
                (p) =>
                    `${JSON.stringify(p.name)}${p.required ? "" : "?"}: ${queryParamType(p.schema, schemas, signature.refs)}`,
            )
            .join("; ");
        args.push(`params: { ${q} }`);
    }

    const url = urlTemplate(path, segmentArgs);

    const callOpts = [];
    if (body) callOpts.push("body");
    if (queryParams.length) callOpts.push("params");
    const optsArg = callOpts.length ? `, { ${callOpts.join(", ")} }` : "";

    let validation = "";
    if (body && body.$ref) {
        signature.validates = true;
        validation = `        S.${zodName(refName(body.$ref))}.parse(body);\n`;
    }

    const ret = retType === "void" ? "Promise<void>" : `Promise<${retType}>`;
    const generic = retType === "void" ? "" : `<${retType}>`;
    return (
        `    /** \`${method.toUpperCase()} ${commentText(path)}\`${op.summary ? ` — ${commentText(op.summary)}` : ""} */\n` +
        `    async ${name}(${args.join(", ")}): ${ret} {\n` +
        validation +
        `        return this.api.${method}${generic}(${url}${optsArg});\n` +
        `    }`
    );
}

// @vitest-environment node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { encodeIdSegment } from "../../../src/data";
import { generate } from "./generate.mjs";

const SPEC = {
    openapi: "3.1.0",
    components: {
        schemas: {
            User: {
                type: "object",
                required: ["id", "email"],
                properties: {
                    id: { type: "integer" },
                    email: { type: "string", format: "email" },
                    name: { type: "string" },
                },
            },
            UserCreate: {
                type: "object",
                required: ["email"],
                properties: {
                    email: { type: "string", format: "email" },
                    name: { type: "string" },
                },
            },
        },
    },
    paths: {
        "/users": {
            get: {
                tags: ["users"],
                operationId: "list_users",
                parameters: [
                    { name: "limit", in: "query", required: false, schema: { type: "integer" } },
                ],
                responses: {
                    200: {
                        content: {
                            "application/json": {
                                schema: {
                                    type: "array",
                                    items: { $ref: "#/components/schemas/User" },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                tags: ["users"],
                operationId: "create_user",
                requestBody: {
                    content: {
                        "application/json": { schema: { $ref: "#/components/schemas/UserCreate" } },
                    },
                },
                responses: {
                    201: {
                        content: {
                            "application/json": { schema: { $ref: "#/components/schemas/User" } },
                        },
                    },
                },
            },
        },
        "/users/{id}": {
            get: {
                tags: ["users"],
                operationId: "get_user",
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "integer" } },
                ],
                responses: {
                    200: {
                        content: {
                            "application/json": { schema: { $ref: "#/components/schemas/User" } },
                        },
                    },
                },
            },
        },
    },
};

describe("generate — FastAPI-style spec", () => {
    const { files, tags } = generate(SPEC);

    it("groups by tag", () => {
        expect(tags).toContain("users");
        expect(Object.keys(files)).toEqual(
            expect.arrayContaining([
                "users/schemas.ts",
                "users/types.ts",
                "users/service.ts",
                "users/index.ts",
                "index.ts",
            ]),
        );
    });

    it("emits Zod schemas for referenced models", () => {
        const s = files["users/schemas.ts"];
        expect(s).toContain('import { z } from "zod";');
        expect(s).toContain("export const UserSchema = z.object({");
        expect(s).toContain("export const UserCreateSchema = z.object({");
        expect(s).toContain('"email": z.string().email()');
    });

    it("emits inferred types", () => {
        const t = files["users/types.ts"];
        expect(t).toContain("export type User = z.infer<typeof S.UserSchema>;");
        expect(t).toContain("export type UserCreate = z.infer<typeof S.UserCreateSchema>;");
    });

    it("emits a service class with one method per route", () => {
        const svc = files["users/service.ts"];
        expect(svc).toContain("export class UsersService {");
        expect(svc).toContain("constructor(private readonly api: ApiClient) {}");
        // list with query params
        expect(svc).toMatch(
            /async listUsers\(params: \{ "limit"\?: number \}\): Promise<User\[\]>/,
        );
        // create with Zod input validation
        expect(svc).toContain("S.UserCreateSchema.parse(body);");
        expect(svc).toMatch(/async createUser\(body: UserCreate\): Promise<User>/);
        expect(svc).toMatch(/async getUser\(id: number\): Promise<User>/);
    });

    it("wraps every path param in encodeIdSegment — the raw `${id}` this used to pin sent '../../account' to /account with the Bearer (#499, the class #438 closed)", () => {
        const svc = files["users/service.ts"];
        expect(svc).not.toContain("`/users/${id}`");
        expect(svc).toContain("return this.api.get<User>(`/users/${encodeIdSegment(id)}`);");
        expect(svc).toContain('import { encodeIdSegment } from "tempest-react-sdk";');
    });
});

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "template");
const OUT = join(TEMPLATE, "src", "__generated_api__");

/**
 * The `create-tempest-app` template's own compiler options, read from
 * `template/tsconfig.json` so the check follows the template when it changes:
 * `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`.
 * `types` is dropped because `vite/client` is not installed at the repo root, and
 * `paths` because nothing generated uses the alias.
 *
 * @returns {import("typescript").CompilerOptions}
 */
function templateCompilerOptions() {
    const { config } = ts.readConfigFile(join(TEMPLATE, "tsconfig.json"), ts.sys.readFile);
    const { types: _types, paths: _paths, ...json } = config.compilerOptions;
    const { options, errors } = ts.convertCompilerOptionsFromJson(json, TEMPLATE);
    expect(errors).toEqual([]);
    return options;
}

/**
 * Type-check the whole generator output as an app scaffolded by
 * `create-tempest-app` would: every group and the root barrel, under the
 * template's compiler options. Files live in a virtual `template/src/` folder so
 * `zod` resolves from the repository's `node_modules`; `tempest-react-sdk` is a
 * stub with the types and the `encodeIdSegment` value the generator imports.
 *
 * @param {Record<string, string>} files - The generator output.
 * @returns {string[]} `file: TSxxxx message` for every diagnostic.
 */
function templateTsc(files) {
    const virtual = new Map(Object.entries(files).map(([f, text]) => [join(OUT, f), text]));
    virtual.set(
        join(OUT, "node_modules", "tempest-react-sdk", "index.d.ts"),
        [
            "type Call = <T = unknown>(url: string, opts?: { body?: unknown; params?: Record<string, string | number | boolean | undefined | null>; headers?: Record<string, string> }) => Promise<T>;",
            "export type ApiClient = { get: Call; post: Call; put: Call; patch: Call; delete: Call };",
            "export type OffsetPage<T> = { items: T[]; total: number };",
            "export type CursorPage<T> = { items: T[]; next_cursor: string | null };",
            "export declare function encodeIdSegment(id: string | number): string;",
        ].join("\n"),
    );
    const options = templateCompilerOptions();
    const host = ts.createCompilerHost(options);
    const readFile = host.readFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    const directoryExists = host.directoryExists?.bind(host);
    const getSourceFile = host.getSourceFile.bind(host);
    host.readFile = (f) => virtual.get(f) ?? readFile(f);
    host.fileExists = (f) => virtual.has(f) || fileExists(f);
    host.directoryExists = (d) => d.startsWith(OUT) || (directoryExists?.(d) ?? true);
    host.getSourceFile = (f, lang) =>
        virtual.has(f) ? ts.createSourceFile(f, virtual.get(f), lang) : getSourceFile(f, lang);
    const roots = Object.keys(files).map((f) => join(OUT, f));
    return ts
        .getPreEmitDiagnostics(ts.createProgram(roots, options, host))
        .map(
            (d) =>
                `${d.file ? d.file.fileName.slice(OUT.length + 1) : "(global)"}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
        );
}

let eslint;

/**
 * Lint the generator output with the template's `eslint.config.js`, as `npm run
 * lint` in a scaffolded app would. Warnings count too: a scaffolded app should
 * not open on a yellow lint run because of a generated file.
 *
 * @param {Record<string, string>} files - The generator output.
 * @returns {Promise<string[]>} `file line:col rule` for every message.
 */
async function templateLint(files) {
    eslint ??= new ESLint({
        cwd: TEMPLATE,
        overrideConfigFile: join(TEMPLATE, "eslint.config.js"),
    });
    const out = [];
    for (const [file, text] of Object.entries(files)) {
        const [result] = await eslint.lintText(text, { filePath: join(OUT, file) });
        for (const m of result.messages) out.push(`${file} ${m.line}:${m.column} ${m.ruleId}`);
    }
    return out;
}

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ content: { "application/json": { schema } } });

/**
 * One spec that puts a `$ref` in every position the generator reads, plus a group
 * with no schema at all. Measured on `main` before #504/#505 under the template's
 * `tsc` and ESLint, it produced:
 *
 * | Position | Failure before the fix |
 * | --- | --- |
 * | path param `$ref` reached by nothing else (the #504 repro, own test below) | TS2304 `Cannot find name 'Kind'` — the type was neither imported nor emitted into `types.ts` |
 * | query param `$ref` (`sort`) | no error, but typed `string`: the enum name was narrowed away |
 * | response-only group | `S` imported unused — TS6133 and `unused-imports/no-unused-imports` |
 * | page envelope / nested schema | `ItemPage` and `Owner` imported unused into `service.ts` |
 * | `OffsetPage` + `CursorPage` together | `simple-import-sort/imports` (pushed in that order) |
 * | group without schema | `z` / `S` unused in `schemas.ts`/`types.ts`, double blank line in `service.ts`, extra blank lines at EOF (`no-multiple-empty-lines`) |
 * | every `types.ts` | `import * as S` used only in `typeof` — `@typescript-eslint/consistent-type-imports` |
 * | every `index.ts` + root barrel | `simple-import-sort/exports` |
 *
 * The `X-Trace` header parameter was not read at all then; since #509 it is, and
 * its `Code` type is imported like any other signature type.
 */
const EVERY_POSITION = {
    openapi: "3.1.0",
    components: {
        schemas: {
            Kind: { type: "string", enum: ["a", "b"] },
            Sort: { type: "string", enum: ["asc", "desc"] },
            Code: { type: "integer" },
            Owner: { type: "object", properties: { name: { type: "string" } } },
            Item: {
                type: "object",
                required: ["id"],
                properties: { id: { type: "integer" }, owner: ref("Owner") },
            },
            ItemCreate: { type: "object", properties: { kind: ref("Kind") } },
            ItemPage: {
                type: "object",
                properties: {
                    items: { type: "array", items: ref("Item") },
                    total: { type: "integer" },
                    pages: { type: "integer" },
                    size: { type: "integer" },
                },
            },
            ItemFeed: {
                type: "object",
                properties: {
                    items: { type: "array", items: ref("Item") },
                    next_cursor: { type: "string", nullable: true },
                    has_more: { type: "boolean" },
                },
            },
        },
    },
    paths: {
        "/items/{kind}": {
            get: {
                tags: ["items"],
                operationId: "list_by_kind",
                parameters: [
                    { name: "kind", in: "path", required: true, schema: ref("Kind") },
                    { name: "sort", in: "query", schema: ref("Sort") },
                    { name: "codes", in: "query", schema: { type: "array", items: ref("Code") } },
                    { name: "X-Trace", in: "header", schema: ref("Code") },
                ],
                responses: { 200: json({ type: "array", items: ref("Item") }) },
            },
        },
        "/items": {
            get: {
                tags: ["items"],
                operationId: "page",
                responses: { 200: json(ref("ItemPage")) },
            },
            post: {
                tags: ["items"],
                operationId: "create_many",
                requestBody: json({ type: "array", items: ref("ItemCreate") }),
                responses: { 201: json(ref("Item")) },
            },
        },
        "/feed": {
            get: {
                tags: ["items"],
                operationId: "feed",
                responses: { 200: json(ref("ItemFeed")) },
            },
        },
        "/reports": {
            get: {
                tags: ["reports"],
                responses: { 200: json({ type: "array", items: ref("Item") }) },
            },
        },
        "/ping": { get: { tags: ["health"], responses: { 200: { description: "ok" } } } },
    },
};

describe("generate — output passes the create-tempest-app template's tsc and ESLint (#504, #505)", () => {
    const { files } = generate(EVERY_POSITION);

    it("a path parameter typed by a $ref imports and declares the type it names (#504)", () => {
        const minimal = generate({
            openapi: "3.1.0",
            components: { schemas: { Kind: { type: "string", enum: ["a", "b"] } } },
            paths: {
                "/items/{kind}": {
                    get: {
                        tags: ["items"],
                        operationId: "get_item",
                        parameters: [
                            { name: "kind", in: "path", required: true, schema: ref("Kind") },
                        ],
                        responses: { 200: { description: "ok" } },
                    },
                },
            },
        }).files;
        expect(minimal["items/service.ts"]).toContain("async getItem(kind: Kind): Promise<void>");
        expect(minimal["items/service.ts"]).toContain('import type { Kind } from "./types";');
        expect(minimal["items/types.ts"]).toContain("export type Kind = ");
        expect(minimal["items/schemas.ts"]).toContain(
            'export const KindSchema = z.enum(["a", "b"]);',
        );
        expect(templateTsc(minimal)).toEqual([]);
    });

    it("a query parameter typed by a scalar $ref keeps its name instead of being narrowed to string", () => {
        const svc = files["items/service.ts"];
        expect(svc).toContain('params: { "sort"?: Sort; "codes"?: string }');
        expect(svc).toMatch(/import type \{[^}]*\bSort\b[^}]*\} from "\.\/types";/);
    });

    it("service.ts imports only the types its signatures name, and S only when a body is validated", () => {
        expect(files["items/service.ts"]).toContain(
            'import type { Code, Item, ItemCreate, Kind, Sort } from "./types";',
        );
        expect(files["items/service.ts"]).not.toContain('import * as S from "./schemas";');
        expect(files["reports/service.ts"]).not.toContain("./schemas");
        expect(files["items/service.ts"]).toContain(
            'import type { ApiClient, CursorPage, OffsetPage } from "tempest-react-sdk";',
        );
    });

    it("a group without any schema imports neither z nor S and has no double blank line (#505)", () => {
        expect(files["health/schemas.ts"]).toBe("export {};\n");
        expect(files["health/types.ts"]).toBe("export {};\n");
        expect(files["health/service.ts"]).not.toMatch(/\n\n\n/);
        expect(files["health/service.ts"]).toMatch(
            /^import type \{ ApiClient \} from "tempest-react-sdk";\n\n\/\*\*/,
        );
    });

    it("type-checks under the template's tsconfig (strict, noUnusedLocals, verbatimModuleSyntax)", () => {
        expect(templateTsc(files)).toEqual([]);
    });

    it("lints clean under the template's eslint.config.js, warnings included", async () => {
        expect(await templateLint(files)).toEqual([]);
    });

    it("the FastAPI-style spec above passes both too", async () => {
        const out = generate(SPEC).files;
        expect(out["users/service.ts"]).toContain('import * as S from "./schemas";');
        expect(templateTsc(out)).toEqual([]);
        expect(await templateLint(out)).toEqual([]);
    });
});

/**
 * Transpile a generated `service.ts` and instantiate its class with a recording
 * `ApiClient`, to read back the URL and options each call actually sends.
 * `encodeIdSegment` is the SDK's real one.
 *
 * @param {string} source - The generated `service.ts`.
 * @returns {{ service: object, calls: Array<[string, object | undefined]> }}
 */
function instantiate(source) {
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const module = { exports: {} };
    const requireStub = (id) => {
        if (id === "tempest-react-sdk") return { encodeIdSegment };
        throw new Error(`unexpected import ${id}`);
    };
    new Function("exports", "require", "module", outputText)(module.exports, requireStub, module);
    const calls = [];
    const api = new Proxy(
        {},
        {
            get: () => async (url, opts) => {
                calls.push([url, opts]);
            },
        },
    );
    const Class = Object.values(module.exports).find((v) => typeof v === "function");
    return { service: new Class(api), calls };
}

/**
 * Measured on `main` before #509 with minimal specs run through `generate`:
 *
 * | Spec | Output before the fix |
 * | --- | --- |
 * | `{id}` declared only on the path item | `getItem(): Promise<void>` calling `"/items/{id}"` — placeholder sent literally |
 * | path item declares `{x}`, operation declares `{y}` | refused: `placeholder "x" is not a declared path parameter` |
 * | required `in: "header"` | `list()` — no argument, nothing sent |
 * | `in: "cookie"` | ignored (stays ignored, on purpose: `fetch` cannot set `Cookie`) |
 * | path-item query + operation override | the path item's `q` lost; the override only looked right because the path item was never read |
 * | parameter `$ref` into `components.parameters` | dropped like the path-item case: `"/items/{id}"` literal |
 */
const PARAMS = {
    openapi: "3.1.0",
    components: {
        schemas: { Region: { type: "string", enum: ["br", "us"] } },
        parameters: {
            Version: { name: "v", in: "path", required: true, schema: { type: "integer" } },
        },
    },
    paths: {
        "/items/{id}": {
            parameters: [
                { name: "id", in: "path", required: true, schema: { type: "string" } },
                { name: "X-Tenant-Id", in: "header", required: true, schema: { type: "string" } },
                { name: "limit", in: "query", schema: { type: "string" } },
            ],
            get: {
                tags: ["items"],
                operationId: "get_item",
                parameters: [
                    { name: "limit", in: "query", required: true, schema: { type: "integer" } },
                    { name: "X-Region", in: "header", schema: ref("Region") },
                    { name: "Retry-Count", in: "header", schema: { type: "integer" } },
                    { name: "session", in: "cookie", schema: { type: "string" } },
                    { name: "Authorization", in: "header", schema: { type: "string" } },
                ],
                responses: { 200: { description: "ok" } },
            },
            delete: {
                tags: ["items"],
                operationId: "delete_item",
                parameters: [
                    {
                        name: "X-Tenant-Id",
                        in: "header",
                        required: false,
                        schema: { type: "string" },
                    },
                ],
                responses: { 204: { description: "gone" } },
            },
        },
        "/v{v}/items": {
            post: {
                tags: ["items"],
                operationId: "create_item",
                parameters: [
                    { $ref: "#/components/parameters/Version" },
                    { name: "Idempotency-Key", in: "header", schema: { type: "string" } },
                ],
                responses: { 201: { description: "ok" } },
            },
        },
    },
};

describe("generate — path-item, header and $ref parameters (#509)", () => {
    const { files } = generate(PARAMS);
    const svc = files["items/service.ts"];

    it("a path parameter declared only on the path item is an argument and goes through encodeIdSegment", () => {
        expect(svc).not.toContain('"/items/{id}"');
        expect(svc).toContain("`/items/${encodeIdSegment(id)}`");
    });

    it("path-item and operation parameters merge, the operation winning on the same (name, in)", () => {
        expect(svc).toContain(
            'async getItem(id: string, params: { "limit": number }, headers: { "X-Tenant-Id": string; "X-Region"?: Region; "Retry-Count"?: number }): Promise<void>',
        );
        expect(svc).toContain(
            'async deleteItem(id: string, params: { "limit"?: string }, headers: { "X-Tenant-Id"?: string } = {}): Promise<void>',
        );
    });

    it("a parameter $ref into components.parameters is resolved", () => {
        expect(svc).toContain("async createItem(v: number, headers: ");
        expect(svc).toContain("`/v${encodeIdSegment(v)}/items`");
    });

    it("cookie parameters and the Accept/Content-Type/Authorization headers are not emitted", () => {
        expect(svc).not.toContain("session");
        expect(svc).not.toContain("Authorization");
    });

    it("header values are sent as strings, and an optional header left out is not sent as 'undefined'", async () => {
        const { service, calls } = instantiate(svc);
        await service.getItem("a/b", { limit: 5 }, { "X-Tenant-Id": "t1", "Retry-Count": 3 });
        await service.deleteItem("7", {});
        await service.createItem(2);
        expect(calls).toEqual([
            [
                "/items/a%2Fb",
                { params: { limit: 5 }, headers: { "X-Tenant-Id": "t1", "Retry-Count": "3" } },
            ],
            ["/items/7", { params: {}, headers: {} }],
            ["/v2/items", { headers: {} }],
        ]);
    });

    it("type-checks and lints clean under the create-tempest-app template", async () => {
        expect(templateTsc(files)).toEqual([]);
        expect(await templateLint(files)).toEqual([]);
    });
});

/**
 * FastAPI publishes a component for every `Enum`-annotated field even when the
 * field's own schema carries a narrower inline enum, so `ImageMediaType` appears
 * with no `$ref` pointing at it. Measured on `main` before #516: it was already
 * left out of every group, because a group only emits the schemas its routes
 * reach. What did break was the name check, which ran over every
 * `components.schemas` entry — an orphan whose name collided with another
 * (`ImageMediaType` / `Image-Media-Type`) aborted the whole run.
 */
const ORPHAN_ENUM = {
    openapi: "3.1.0",
    components: {
        schemas: {
            ImageMediaType: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
            "Image-Media-Type": { type: "string", enum: ["image/gif"] },
            Kind: { type: "string", enum: ["photo", "avatar"] },
            Upload: {
                type: "object",
                properties: {
                    kind: ref("Kind"),
                    media_type: { type: "string", enum: ["image/png", "image/jpeg"] },
                },
            },
        },
    },
    paths: {
        "/uploads": {
            post: {
                tags: ["uploads"],
                operationId: "create_upload",
                requestBody: json(ref("Upload")),
                responses: { 201: json(ref("Upload")) },
            },
        },
    },
};

describe("generate — enum schemas no $ref reaches (#516)", () => {
    it("keeps an enum reached transitively and drops the orphan, even when the orphan's name collides", async () => {
        const { files } = generate(ORPHAN_ENUM);
        expect(files["uploads/types.ts"]).toContain("export type Kind = ");
        expect(files["uploads/schemas.ts"]).toContain(
            'export const KindSchema = z.enum(["photo", "avatar"]);',
        );
        expect(Object.values(files).join("\n")).not.toContain("ImageMediaType");
        expect(Object.values(files).join("\n")).not.toContain("image/webp");
        expect(templateTsc(files)).toEqual([]);
        expect(await templateLint(files)).toEqual([]);
    });
});

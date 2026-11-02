import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { encodeIdSegment } from "../../../src/data";
import { generate } from "./generate.mjs";

/**
 * Gives the tests in this file 60 s instead of Vitest's 5 s default.
 *
 * Several of them build a TypeScript program (and, some, an ESLint instance)
 * in-process over the generated files. That takes 3-5 s on an idle machine,
 * right at the default, so a busy one — another suite, a model training — failed
 * them by timeout while the code was correct: 5.1-5.7 s measured in three
 * `make check` runs on 2026-11-01, load average between 21 and 48.
 * `test/docs-guard.test.ts` gives its compile 120 s for the same reason.
 */
vi.setConfig({ testTimeout: 60_000 });

const require = createRequire(import.meta.url);
/**
 * Transpile one generated TypeScript file and run it in a fresh VM context.
 *
 * The context gets its own `globalThis`, so any `globalThis.PWNED_*` an injected
 * statement sets lands on `context` and the test can read it back. `zod` is the
 * real package, `tempest-react-sdk` exposes the real `encodeIdSegment` every path
 * parameter goes through (#499); `./schemas` resolves to the module evaluated
 * before it.
 *
 * @param {string} source - The generated `.ts` contents.
 * @param {object} context - The VM context shared by the group's files.
 * @param {Record<string, unknown>} modules - Already-evaluated sibling modules.
 * @returns {Record<string, unknown>} The module's CommonJS exports.
 */
function evaluate(source, context, modules) {
    const { outputText, diagnostics } = ts.transpileModule(source, {
        reportDiagnostics: true,
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    });
    expect(diagnostics ?? []).toEqual([]);
    const module = { exports: {} };
    const localRequire = (id) => {
        if (id in modules) return modules[id];
        if (id === "zod") return require("zod");
        if (id === "tempest-react-sdk") return { encodeIdSegment };
        throw new Error(`unexpected import ${id}`);
    };
    vm.runInContext(`(function (exports, require, module) {\n${outputText}\n})`, context)(
        module.exports,
        localRequire,
        module,
    );
    return module.exports;
}
/**
 * Evaluate a generated group (`schemas.ts` then `service.ts`) and call every
 * method of its service class with a recording fake `ApiClient`.
 *
 * @param {Record<string, string>} files - The generator output.
 * @param {string} slug - The group folder.
 * @returns {Promise<{ context: object, urls: string[] }>}
 */
async function runGroup(files, slug) {
    const context = vm.createContext({});
    const schemas = evaluate(files[`${slug}/schemas.ts`], context, {});
    const service = evaluate(files[`${slug}/service.ts`], context, { "./schemas": schemas });
    const urls = [];
    const api = new Proxy(
        {},
        {
            get: () => async (url) => {
                urls.push(url);
                return undefined;
            },
        },
    );
    const Class = Object.values(service).find((v) => typeof v === "function");
    const instance = new Class(api);
    const proto = Object.getPrototypeOf(instance);
    for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === "constructor") continue;
        await instance[name]("v-value", {});
    }
    return { context, urls };
}
/** Wrap one operation into a minimal OpenAPI document. */
function spec(paths, schemas = {}) {
    return { openapi: "3.1.0", components: { schemas }, paths };
}

const OK = { 200: { description: "ok" } };
const schemaRef = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ content: { "application/json": { schema } } });

describe("generate — hostile spec text never becomes code (#434)", () => {
    it("a tag that closes the class doc comment stays inside it", async () => {
        const tag = 'items" routes. */ globalThis.PWNED_TAG = 1; /* x';
        const { files } = generate(spec({ "/a": { get: { tags: [tag], responses: OK } } }));
        const slug = Object.keys(files)
            .find((f) => f.endsWith("/service.ts"))
            .split("/")[0];
        const { context } = await runGroup(files, slug);
        expect(context.PWNED_TAG).toBeUndefined();
    });

    it("a summary that closes the method doc comment stays inside it", async () => {
        const summary = "*/ static { globalThis.PWNED_SUMMARY = 1 } /**";
        const { files } = generate(
            spec({ "/a": { get: { tags: ["t"], summary, responses: OK } } }),
        );
        const { context } = await runGroup(files, "t");
        expect(context.PWNED_SUMMARY).toBeUndefined();
    });

    it("a summary with a line break cannot start a new statement", async () => {
        const summary = "first\n*/ globalThis.PWNED_NEWLINE = 1; /*";
        const { files } = generate(
            spec({ "/a": { get: { tags: ["t"], summary, responses: OK } } }),
        );
        expect(files["t/service.ts"]).not.toMatch(/first\n/);
        const { context } = await runGroup(files, "t");
        expect(context.PWNED_NEWLINE).toBeUndefined();
    });

    it("a path that breaks out of the URL template literal is sent verbatim", async () => {
        const path = "/run/`+(globalThis.PWNED_TICK=1)+`/\\/$/{v}/${tail";
        const { files } = generate(
            spec({
                [path]: {
                    get: {
                        tags: ["t"],
                        parameters: [{ name: "v", in: "path", required: true }],
                        responses: OK,
                    },
                },
            }),
        );
        const { context, urls } = await runGroup(files, "t");
        expect(context.PWNED_TICK).toBeUndefined();
        expect(urls).toEqual(["/run/`+(globalThis.PWNED_TICK=1)+`/\\/$/v-value/${tail"]);
    });

    it("a path placeholder that is not a declared path parameter is refused", () => {
        expect(() =>
            generate(
                spec({
                    "/run/{globalThis.PWNED_PATH=1}": {
                        get: {
                            tags: ["t"],
                            parameters: [{ name: "v", in: "path", required: true }],
                            responses: OK,
                        },
                    },
                }),
            ),
        ).toThrow(/placeholder "globalThis.PWNED_PATH=1".*not a declared path parameter/);
    });

    it("a path parameter whose name injects code is mapped to an inert identifier", async () => {
        const name = "a=globalThis.PWNED_PARAM=1";
        const { files } = generate(
            spec({
                [`/run/{${name}}`]: {
                    get: {
                        tags: ["t"],
                        parameters: [{ name, in: "path", required: true }],
                        responses: OK,
                    },
                },
            }),
        );
        expect(
            files["t/service.ts"],
            "was refused until #434's follow-up: refusing every non-identifier also refused " +
                "real `{user-id}` params; the mapping keeps only [A-Za-z0-9]",
        ).toContain("aGlobalThisPWNEDPARAM1: string");
        const { context, urls } = await runGroup(files, "t");
        expect(context.PWNED_PARAM).toBeUndefined();
        expect(urls).toEqual(["/run/v-value"]);
    });

    it("a schema name that injects a statement is mapped to an inert identifier", async () => {
        const name = "Thing = z.string(); globalThis.PWNED_NAME = 1; export const Other";
        const { files } = generate(
            spec(
                {
                    "/a": {
                        post: {
                            tags: ["t"],
                            requestBody: {
                                content: {
                                    "application/json": {
                                        schema: { $ref: `#/components/schemas/${name}` },
                                    },
                                },
                            },
                            responses: OK,
                        },
                    },
                },
                { [name]: { type: "object" } },
            ),
        );
        expect(
            files["t/schemas.ts"],
            "was refused until #434's follow-up: `user.Response` / `User-Out` are legitimate " +
                "names, and the PascalCase mapping leaves nothing executable",
        ).toContain("export const ThingZStringGlobalThisPWNEDNAME1ExportConstOtherSchema =");
        const context = vm.createContext({});
        const S = evaluate(files["t/schemas.ts"], context, {});
        evaluate(files["t/service.ts"], context, { "./schemas": S });
        expect(context.PWNED_NAME).toBeUndefined();
    });

    it("a schema named after a reserved word gets a _ prefix", async () => {
        const { files } = generate(
            spec(
                {
                    "/a": {
                        get: {
                            tags: ["t"],
                            responses: {
                                200: {
                                    content: {
                                        "application/json": {
                                            schema: { $ref: "#/components/schemas/string" },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                { string: { type: "object" } },
            ),
        );
        expect(files["t/types.ts"]).toContain(
            "export type _string = z.infer<typeof S._stringSchema>;",
        );
        await runGroup(files, "t");
    });

    /**
     * Rewritten for #516: this used to pass with `spec({}, …)`, two schemas no
     * route reaches. The check now runs over the schemas a group emits, so the
     * pair has to be referenced to collide — and still is refused, naming both.
     */
    it("two schema names that map to the same identifier are refused, naming both", () => {
        const both = {
            200: json({ anyOf: [schemaRef("User-Out"), schemaRef("user.Out")] }),
        };
        expect(() =>
            generate(
                spec(
                    { "/a": { get: { tags: ["t"], responses: both } } },
                    { "User-Out": { type: "object" }, "user.Out": { type: "object" } },
                ),
            ),
        ).toThrow(/"User-Out" and "user\.Out" both map to the TypeScript identifier "UserOut"/);
    });

    it("schema names no route reaches are neither emitted nor checked, so an orphan cannot abort the run (#516)", () => {
        const { files } = generate(
            spec(
                {
                    "/a": {
                        get: { tags: ["t"], responses: { 200: json(schemaRef("MediaType")) } },
                    },
                },
                {
                    MediaType: { type: "string", enum: ["image/png"] },
                    "Media-Type": { type: "string", enum: ["image/png", "image/webp"] },
                    "***": { type: "object" },
                },
            ),
        );
        expect(files["t/types.ts"]).toContain("export type MediaType = ");
        expect(files["t/schemas.ts"]).not.toContain("image/webp");
        expect(files["t/types.ts"].match(/export type/g)).toHaveLength(1);
    });

    it("a path parameter that maps onto another method argument is refused", () => {
        expect(() =>
            generate(
                spec({
                    "/a/{user-id}/{userId}": {
                        get: {
                            tags: ["t"],
                            parameters: [
                                { name: "user-id", in: "path" },
                                { name: "userId", in: "path" },
                            ],
                            responses: OK,
                        },
                    },
                }),
            ),
        ).toThrow(/"user-id" and "userId" both map to the TypeScript identifier "userId"/);
    });

    /** Rewritten for #516 like the collision above: the schema is now referenced. */
    it("a name with nothing to build an identifier from is refused", () => {
        expect(() =>
            generate(
                spec(
                    { "/a": { get: { tags: ["t"], responses: { 200: json(schemaRef("***")) } } } },
                    { "***": { type: "object" } },
                ),
            ),
        ).toThrow(/schema name "\*\*\*" has no letter or digit/);
    });

    it("a regex pattern with an escaped slash or a line break compiles to the same regex", () => {
        const schemas = {
            Body: {
                type: "object",
                properties: {
                    slash: { type: "string", pattern: "^a\\/b$" },
                    newline: { type: "string", pattern: "^a\nb$" },
                },
            },
        };
        const { files } = generate(
            spec(
                {
                    "/a": {
                        post: {
                            tags: ["t"],
                            requestBody: {
                                content: {
                                    "application/json": {
                                        schema: { $ref: "#/components/schemas/Body" },
                                    },
                                },
                            },
                            responses: OK,
                        },
                    },
                },
                schemas,
            ),
        );
        const S = evaluate(files["t/schemas.ts"], vm.createContext({}), {});
        expect(S.BodySchema.safeParse({ slash: "a/b", newline: "a\nb" }).success).toBe(true);
        expect(S.BodySchema.safeParse({ slash: "a\\/b" }).success).toBe(false);
    });

    it("an operationId that sanitizes to nothing still yields a valid method", async () => {
        const { files } = generate(
            spec({
                "/a/{v}": {
                    get: {
                        tags: ["t"],
                        operationId: "123",
                        parameters: [{ name: "v", in: "path" }],
                        responses: OK,
                    },
                },
            }),
        );
        const { urls } = await runGroup(files, "t");
        expect(urls).toEqual(["/a/v-value"]);
    });

    it("a tag that slugs to a leading digit still yields a valid class", async () => {
        const { files } = generate(spec({ "/a": { get: { tags: ["2fa"], responses: OK } } }));
        const { urls } = await runGroup(files, "2fa");
        expect(urls).toEqual(["/a"]);
    });
});

describe("generate — real-world names that are not identifiers are mapped", () => {
    const REAL = spec(
        {
            "/users/{user-id}/profile": {
                put: {
                    tags: ["users"],
                    operationId: "update_profile",
                    parameters: [
                        { name: "user-id", in: "path", required: true, schema: { type: "string" } },
                    ],
                    requestBody: {
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/User-In" },
                            },
                        },
                    },
                    responses: {
                        200: {
                            content: {
                                "application/json": {
                                    schema: { $ref: "#/components/schemas/user.Response" },
                                },
                            },
                        },
                    },
                },
            },
        },
        {
            "User-In": {
                type: "object",
                required: ["display-name"],
                properties: { "display-name": { type: "string" } },
            },
            "user.Response": {
                type: "object",
                properties: {
                    id: { type: "string" },
                    owner: { $ref: "#/components/schemas/User-In" },
                },
            },
        },
    );

    it("generates code that transpiles, runs and builds the URL with the spec's names", async () => {
        const { files } = generate(REAL);
        const service = files["users/service.ts"];
        expect(service).toContain(
            "async updateProfile(userId: string, body: UserIn): Promise<UserResponse>",
        );
        expect(service).toContain("S.UserInSchema.parse(body);");
        expect(files["users/types.ts"]).toContain(
            "export type UserResponse = z.infer<typeof S.UserResponseSchema>;",
        );
        expect(files["users/schemas.ts"]).toContain('"display-name": z.string()');

        const context = vm.createContext({});
        const S = evaluate(files["users/schemas.ts"], context, {});
        const mod = evaluate(service, context, { "./schemas": S });
        const calls = [];
        const api = { put: async (url, opts) => calls.push({ url, opts }) };
        await new mod.UsersService(api).updateProfile("42", { "display-name": "Ana" });
        expect(calls).toEqual([
            { url: "/users/42/profile", opts: { body: { "display-name": "Ana" } } },
        ]);
        await expect(new mod.UsersService(api).updateProfile("42", {})).rejects.toThrow();
    });
});

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Type-check a generated group with the full TypeScript checker, not just the
 * parser: duplicate parameters, shadowed imports and non-generic `Promise` are
 * semantic errors that `transpileModule` does not report.
 *
 * Files live in a virtual folder under the repository so `zod` resolves from its
 * `node_modules`; `tempest-react-sdk` is swapped for a stub with the three types
 * and the `encodeIdSegment` value the generator imports from it.
 *
 * @param {Record<string, string>} files - The generator output.
 * @param {string} slug - The group folder.
 * @returns {string[]} Diagnostic messages.
 */
function typecheck(files, slug) {
    const root = join(REPO, "__virtual_openapi__");
    const virtual = new Map(
        ["schemas.ts", "types.ts", "service.ts"].map((f) => [
            join(root, f),
            files[`${slug}/${f}`].replaceAll('from "tempest-react-sdk"', 'from "./sdk"'),
        ]),
    );
    virtual.set(
        join(root, "sdk.ts"),
        [
            "type Call = <T = unknown>(url: string, opts?: unknown) => Promise<T>;",
            "export type ApiClient = { get: Call; post: Call; put: Call; patch: Call; delete: Call };",
            "export type OffsetPage<T> = { items: T[]; total: number };",
            "export type CursorPage<T> = { items: T[]; next_cursor: string | null };",
            "export declare function encodeIdSegment(id: string | number): string;",
        ].join("\n"),
    );
    const options = {
        strict: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        skipLibCheck: true,
        noEmit: true,
    };
    const host = ts.createCompilerHost(options);
    const readFile = host.readFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    const directoryExists = host.directoryExists?.bind(host);
    const getSourceFile = host.getSourceFile.bind(host);
    host.readFile = (f) => virtual.get(f) ?? readFile(f);
    host.fileExists = (f) => virtual.has(f) || fileExists(f);
    host.directoryExists = (d) => d === root || (directoryExists?.(d) ?? true);
    host.getSourceFile = (f, lang) =>
        virtual.has(f) ? ts.createSourceFile(f, virtual.get(f), lang) : getSourceFile(f, lang);
    const program = ts.createProgram([...virtual.keys()], options, host);
    return ts
        .getPreEmitDiagnostics(program)
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

const JSON_BODY = (ref) => ({
    content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});
const JSON_OK = (ref) => ({ 200: JSON_BODY(ref) });

describe("generate — names that collide with what the generator itself declares", () => {
    it("a path parameter named body, params, S or encodeIdSegment is renamed, not duplicated or shadowing", async () => {
        const { files } = generate(
            spec(
                {
                    "/a/{body}/{params}/{S}/{encodeIdSegment}": {
                        post: {
                            tags: ["t"],
                            operationId: "send",
                            parameters: [
                                { name: "body", in: "path", required: true },
                                { name: "params", in: "path", required: true },
                                { name: "S", in: "path", required: true },
                                { name: "encodeIdSegment", in: "path", required: true },
                                { name: "q", in: "query" },
                            ],
                            requestBody: JSON_BODY("Req"),
                            responses: OK,
                        },
                    },
                },
                { Req: { type: "object" } },
            ),
        );
        expect(typecheck(files, "t")).toEqual([]);
        const context = vm.createContext({});
        const S = evaluate(files["t/schemas.ts"], context, {});
        const mod = evaluate(files["t/service.ts"], context, { "./schemas": S });
        const calls = [];
        const api = { post: async (url, opts) => calls.push({ url, opts }) };
        await new mod.TService(api).send("b", "p", "s", "e/x", { k: 1 }, { q: "x" });
        expect(files["t/service.ts"]).toContain("${encodeIdSegment(encodeIdSegmentParam)}");
        expect(calls).toEqual([
            { url: "/a/b/p/s/e%2Fx", opts: { body: { k: 1 }, params: { q: "x" } } },
        ]);
    });

    it("an operationId of constructor or api becomes a distinct method", async () => {
        const { files } = generate(
            spec({
                "/a": { get: { tags: ["t"], operationId: "constructor", responses: OK } },
                "/b": { get: { tags: ["t"], operationId: "api", responses: OK } },
            }),
        );
        expect(typecheck(files, "t")).toEqual([]);
        const { urls } = await runGroup(files, "t");
        expect(urls.sort()).toEqual(["/a", "/b"]);
    });

    it("path parameters named eval or arguments are prefixed for strict mode", async () => {
        const { files } = generate(
            spec({
                "/a/{eval}/{arguments}": {
                    get: {
                        tags: ["t"],
                        operationId: "get",
                        parameters: [
                            { name: "eval", in: "path" },
                            { name: "arguments", in: "path" },
                        ],
                        responses: OK,
                    },
                },
            }),
        );
        expect(typecheck(files, "t")).toEqual([]);
        expect(files["t/service.ts"]).toContain("_eval: string, _arguments: string");
        const context = vm.createContext({});
        const mod = evaluate(files["t/service.ts"], context, {});
        const calls = [];
        await new mod.TService({ get: async (url) => calls.push(url) }).get("e", "a");
        expect(calls).toEqual(["/a/e/a"]);
    });

    it("two tags whose barrel names collide are refused, naming both", () => {
        expect(() =>
            generate(
                spec({
                    "/a": { get: { tags: ["user 1"], responses: OK } },
                    "/b": { get: { tags: ["user1"], responses: OK } },
                }),
            ),
        ).toThrow(/"user-1" and "user1" both map to the TypeScript identifier "user1"/);
    });

    it("schemas named after generated imports or used globals are prefixed", () => {
        const page = {
            type: "object",
            properties: {
                items: { type: "array", items: { $ref: "#/components/schemas/Promise" } },
                total: { type: "integer" },
                pages: { type: "integer" },
                size: { type: "integer" },
            },
        };
        const names = [
            "ApiClient",
            "OffsetPage",
            "CursorPage",
            "Promise",
            "Record",
            "z",
            "S",
            "encodeIdSegment",
        ];
        const paths = Object.fromEntries(
            names.map((n, i) => [
                `/n${i}`,
                { post: { tags: ["t"], requestBody: JSON_BODY(n), responses: JSON_OK("Page") } },
            ]),
        );
        paths["/free"] = {
            get: {
                tags: ["t"],
                responses: {
                    200: { content: { "application/json": { schema: { type: "object" } } } },
                },
            },
        };
        paths["/p/{id}"] = {
            get: {
                tags: ["t"],
                parameters: [{ name: "id", in: "path", required: true }],
                responses: OK,
            },
        };
        const schemas = Object.fromEntries(names.map((n) => [n, { type: "object" }]));
        schemas.Page = page;
        const { files } = generate(spec(paths, schemas));
        expect(files["t/service.ts"]).toContain("OffsetPage<_Promise>");
        expect(files["t/service.ts"]).toContain(
            'import { encodeIdSegment } from "tempest-react-sdk";',
        );
        expect(files["t/types.ts"]).toContain("export type _encodeIdSegment =");
        expect(typecheck(files, "t")).toEqual([]);
    });

    it("an invalid regex pattern fails generation, naming the schema and property", () => {
        expect(() =>
            generate(
                spec(
                    {
                        "/a": {
                            post: { tags: ["t"], requestBody: JSON_BODY("Body"), responses: OK },
                        },
                    },
                    {
                        Body: {
                            type: "object",
                            properties: {
                                inner: {
                                    type: "object",
                                    properties: { code: { type: "string", pattern: "(" } },
                                },
                            },
                        },
                    },
                ),
            ),
        ).toThrow(
            /schema "Body" at properties\.inner\.properties\.code: pattern "\(" is not a valid/,
        );
    });
});

describe("generate — spec text that would leave its place in the output (#533)", () => {
    const ESC_TAG = "items\u001b]0;PWNED\u0007\u009b31m\r";
    const POST_BODY = {
        "/a": { post: { tags: ["t"], requestBody: JSON_BODY("Body"), responses: OK } },
    };

    it("a path key that is an absolute URL is refused, so no method calls another origin", () => {
        expect(() =>
            generate(spec({ "https://other.example/x": { get: { tags: ["t"], responses: OK } } })),
        ).toThrow(/path "https:\/\/other\.example\/x" does not start with "\/"/);
    });

    it.each(["/../x", "/a/./b", "/a/..", "/%2e%2E/x", "/a\\..\\x", "/./x?y=1"])(
        "a path key with a dot segment (%s) is refused, so it cannot climb out of the baseURL path",
        (path) => {
            expect(() =>
                generate(spec({ [path]: { get: { tags: ["t"], responses: OK } } })),
            ).toThrow(/has a "\." or "\.\." segment/);
        },
    );

    it("dots inside a segment, dots in the query and a doubled slash still generate", () => {
        const { files } = generate(
            spec({
                "/v1.2/..cache/file.json": { get: { tags: ["t"], responses: OK } },
                "//double/slash": { get: { tags: ["t"], responses: OK } },
                "/search?q=..": { get: { tags: ["t"], responses: OK } },
            }),
        );
        expect(files["t/service.ts"]).toContain('"/v1.2/..cache/file.json"');
        expect(files["t/service.ts"]).toContain('"/search?q=.."');
    });

    it("a property named __proto__ is refused instead of silently vanishing from the Zod shape", () => {
        const Body = JSON.parse(
            '{"type":"object","required":["__proto__"],"properties":{"__proto__":{"type":"string"}}}',
        );
        expect(() => generate(spec(POST_BODY, { Body }))).toThrow(
            /schema "Body" at \(root\): a property named "__proto__" cannot be validated/,
        );
    });

    it("a default value with a nested __proto__ key is refused", () => {
        const Body = JSON.parse(
            '{"type":"object","properties":{"meta":{"type":"object","default":{"a":{"__proto__":{"admin":true}}}}}}',
        );
        expect(() => generate(spec(POST_BODY, { Body }))).toThrow(
            /schema "Body" at properties\.meta: the default value has a "__proto__" key/,
        );
    });

    const KEYWORD_NAMES = [
        "pattern",
        "default",
        "enum",
        "items",
        "properties",
        "additionalProperties",
        "allOf",
        "anyOf",
        "oneOf",
        "required",
        "type",
        "$ref",
    ];

    /**
     * A `Body` schema with one property, named `name`, whose schema is `inner`.
     *
     * @param {string} name - The property name, often a JSON Schema keyword.
     * @param {object} inner - The property's schema.
     * @returns {object} The spec.
     */
    function keywordNamedProperty(name, inner) {
        return spec(POST_BODY, {
            Body: { type: "object", required: [name], properties: { [name]: inner } },
        });
    }

    it.each(KEYWORD_NAMES)(
        "a property named %s holding a required __proto__ is refused, naming where it sits (#562)",
        (name) => {
            const inner = JSON.parse(
                '{"type":"object","required":["__proto__"],"properties":{"__proto__":{"type":"string"}}}',
            );
            expect(() => generate(keywordNamedProperty(name, inner))).toThrow(
                `schema "Body" at properties.${name}: a property named "__proto__" cannot be validated`,
            );
        },
    );

    it.each(KEYWORD_NAMES)(
        "a property named %s whose schema has a __proto__ default is refused at that property (#562)",
        (name) => {
            const inner = JSON.parse('{"type":"object","default":{"__proto__":{"admin":true}}}');
            expect(() => generate(keywordNamedProperty(name, inner))).toThrow(
                `schema "Body" at properties.${name}: the default value has a "__proto__" key`,
            );
        },
    );

    it.each(KEYWORD_NAMES)(
        "an invalid regex under a property named %s fails generation (#562)",
        (name) => {
            const inner = {
                type: "object",
                properties: { code: { type: "string", pattern: "(" } },
            };
            expect(() => generate(keywordNamedProperty(name, inner))).toThrow(
                `schema "Body" at properties.${name}.properties.code: pattern "(" is not a valid`,
            );
        },
    );

    it.each(KEYWORD_NAMES)(
        "a nested-quantifier pattern under a property named %s comes back as a warning (#562)",
        (name) => {
            const inner = { type: "string", pattern: "^(a+)+$" };
            const { warnings } = generate(keywordNamedProperty(name, inner));
            expect(warnings).toHaveLength(1);
            expect(warnings[0]).toContain(`schema "Body" at properties.${name}: pattern`);
        },
    );

    it("properties named after keywords generate, typecheck and are each validated (#562)", () => {
        const properties = Object.fromEntries(
            KEYWORD_NAMES.map((name) => [name, { type: "string", minLength: 2 }]),
        );
        const generated = spec(POST_BODY, {
            Body: { type: "object", required: KEYWORD_NAMES, properties },
        });
        const { files, warnings } = generate(generated);
        expect(warnings).toEqual([]);
        expect(typecheck(files, "t")).toEqual([]);
        const schemas = evaluate(files["t/schemas.ts"], vm.createContext({}), {});
        const valid = Object.fromEntries(KEYWORD_NAMES.map((name) => [name, "ok"]));
        expect(schemas.BodySchema.safeParse(valid).success).toBe(true);
        for (const name of KEYWORD_NAMES) {
            expect(schemas.BodySchema.safeParse({ ...valid, [name]: {} }).success).toBe(false);
        }
    });

    it("properties called constructor or prototype still generate and are validated", () => {
        const { files } = generate(
            spec(POST_BODY, {
                Body: {
                    type: "object",
                    required: ["constructor"],
                    properties: {
                        constructor: { type: "string" },
                        prototype: { type: "string" },
                    },
                },
            }),
        );
        const schemas = evaluate(files["t/schemas.ts"], vm.createContext({}), {});
        expect(schemas.BodySchema.safeParse({ constructor: 1 }).success).toBe(false);
        expect(schemas.BodySchema.safeParse({ constructor: "x" }).success).toBe(true);
    });

    it("a nested-quantifier pattern still generates and comes back as a warning naming the schema", () => {
        const { files, warnings } = generate(
            spec(POST_BODY, {
                Body: {
                    type: "object",
                    properties: {
                        slug: { type: "string", pattern: "^([a-z0-9]+-)*[a-z0-9]+$" },
                        evil: { type: "string", pattern: "^(a+)+$" },
                    },
                },
            }),
        );
        expect(files["t/schemas.ts"]).toContain('new RegExp("^(a+)+$")');
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatch(/schema "Body" at properties\.evil: pattern "\^\(a\+\)\+\$"/);
    });

    it("terminal control characters in a tag do not reach the generated doc comment", () => {
        const { files, tags } = generate(
            spec({ "/a": { get: { tags: [ESC_TAG], responses: OK } } }),
        );
        const service = Object.entries(files).find(([f]) => f.endsWith("/service.ts"))[1];
        expect(tags).toEqual([ESC_TAG]);
        expect(service).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
        expect(service).toContain('the "items]0;PWNED31m " routes');
    });

    it("the folder and class reported for each group are the ones written", () => {
        const { files, services } = generate(
            spec({ "/a": { get: { tags: ["Items API"], responses: OK } } }),
        );
        expect(services).toEqual([{ slug: "items-api", className: "ItemsApiService" }]);
        expect(files["items-api/service.ts"]).toContain("export class ItemsApiService");
    });

    it("the output for a spec with control characters and a flagged pattern typechecks", () => {
        const { files } = generate(
            spec(
                {
                    "/a/{id}": {
                        post: {
                            tags: ["t"],
                            summary: "x\u001b[2J\u009d8;;https://evil/\u009c",
                            parameters: [
                                {
                                    name: "id",
                                    in: "path",
                                    required: true,
                                    schema: { type: "string" },
                                },
                            ],
                            requestBody: JSON_BODY("Body"),
                            responses: OK,
                        },
                    },
                },
                {
                    Body: {
                        type: "object",
                        properties: { evil: { type: "string", pattern: "(\\w+\\s?)*" } },
                    },
                },
            ),
        );
        expect(typecheck(files, "t")).toEqual([]);
    });
});

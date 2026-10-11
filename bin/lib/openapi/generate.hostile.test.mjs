import { createRequire } from "node:module";
import vm from "node:vm";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { generate } from "./generate.mjs";

const require = createRequire(import.meta.url);
/**
 * Transpile one generated TypeScript file and run it in a fresh VM context.
 *
 * The context gets its own `globalThis`, so any `globalThis.PWNED_*` an injected
 * statement sets lands on `context` and the test can read it back. `zod` is the
 * real package; `./schemas` resolves to the module evaluated before it.
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
        if (id === "zod" || id === "tempest-react-sdk") return id === "zod" ? require("zod") : {};
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

    it("two schema names that map to the same identifier are refused, naming both", () => {
        expect(() =>
            generate(spec({}, { "User-Out": { type: "object" }, "user.Out": { type: "object" } })),
        ).toThrow(/"User-Out" and "user\.Out" both map to the TypeScript identifier "UserOut"/);
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

    it("a name with nothing to build an identifier from is refused", () => {
        expect(() => generate(spec({}, { "***": { type: "object" } }))).toThrow(
            /schema name "\*\*\*" has no letter or digit/,
        );
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

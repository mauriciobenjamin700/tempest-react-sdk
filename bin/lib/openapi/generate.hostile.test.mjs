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

    it("a path parameter whose name is not an identifier is refused", () => {
        const name = "a=globalThis.PWNED_PARAM=1";
        expect(() =>
            generate(
                spec({
                    [`/run/{${name}}`]: {
                        get: {
                            tags: ["t"],
                            parameters: [{ name, in: "path", required: true }],
                            responses: OK,
                        },
                    },
                }),
            ),
        ).toThrow(/path parameter .* is not a valid TypeScript identifier/);
    });

    it("a schema name that injects a statement is refused", () => {
        const name = "Thing = z.string(); globalThis.PWNED_NAME = 1; export const Other";
        expect(() =>
            generate(
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
            ),
        ).toThrow(/schema name .* is not a valid TypeScript identifier/);
    });

    it("a schema named after a reserved word is refused", () => {
        expect(() =>
            generate(
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
            ),
        ).toThrow(/schema name "string" is a reserved word/);
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

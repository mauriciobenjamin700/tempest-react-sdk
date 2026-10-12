import ts from "typescript";
import { describe, expect, it } from "vitest";

import { encodeIdSegment } from "../../../src/data";
import { createApiClient } from "../../../src/http";
import { generate } from "./generate.mjs";

const BASE = "https://api.example.test";

/**
 * Transpile one generated `service.ts` and load it as CommonJS, resolving
 * `tempest-react-sdk` to the SDK's real source — so the call goes through the
 * genuine `encodeIdSegment` and `createApiClient`, not a stub of either.
 *
 * @param {string} source - The generated `service.ts` contents.
 * @returns {Record<string, unknown>} The module's exports.
 */
function load(source) {
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const module = { exports: {} };
    const require = (id) => {
        if (id === "tempest-react-sdk") return { encodeIdSegment };
        throw new Error(`unexpected import ${id}`);
    };
    new Function("exports", "require", "module", outputText)(module.exports, require, module);
    return module.exports;
}

/**
 * Generate a one-route `comments` service (`GET`/`DELETE /api/comments/{id}`)
 * bound to a real `ApiClient` whose `fetcher` records every request.
 *
 * @param {object} [schema] - The `id` path parameter's schema.
 * @param {string} [baseURL] - The client's base URL.
 * @returns {{ service: Record<string, Function>, seen: string[], source: string }}
 */
function commentsService(schema = { type: "string" }, baseURL = BASE) {
    const op = (operationId) => ({
        operationId,
        tags: ["comments"],
        parameters: [{ name: "id", in: "path", required: true, schema }],
        responses: { 204: { description: "x" } },
    });
    const { files } = generate({
        openapi: "3.1.0",
        info: { title: "t", version: "1" },
        paths: { "/api/comments/{id}": { get: op("getComment"), delete: op("deleteComment") } },
    });
    const source = files["comments/service.ts"];
    const seen = [];
    const api = createApiClient({
        baseURL,
        getToken: () => "DUMMY_TOKEN",
        fetcher: async (url, init) => {
            seen.push(`${init?.method ?? "GET"} ${String(url)}`);
            return new Response(null, { status: 204 });
        },
    });
    const { CommentsService } = load(source);
    return { service: new CommentsService(api), seen, source };
}

describe("generate — path params are encoded into one segment (#499, as #438 did for the data provider)", () => {
    it.each([
        ["../../account", "..%2F..%2Faccount"],
        ["../x", "..%2Fx"],
        ["%2e%2e/%2e%2e/account", "%252e%252e%2F%252e%252e%2Faccount"],
        ["7?a=b", "7%3Fa%3Db"],
        ["7?role=admin", "7%3Frole%3Dadmin"],
        ["7#x", "7%23x"],
    ])("a hostile id %j stays one segment under /api/comments", async (id, segment) => {
        const { service, seen } = commentsService();
        await service.deleteComment(id);
        expect(seen).toEqual([`DELETE ${BASE}/api/comments/${segment}`]);
    });

    it("a base URL prefix cannot be escaped with extra dot-segments", async () => {
        const { service, seen } = commentsService({ type: "string" }, `${BASE}/v1`);
        await service.deleteComment("../../../account");
        expect(seen).toEqual([`DELETE ${BASE}/v1/api/comments/..%2F..%2F..%2Faccount`]);
    });

    it.each(["", ".", ".."])("the dot-segment id %j throws before any request", async (id) => {
        const { service, seen } = commentsService();
        await expect(service.deleteComment(id)).rejects.toThrow(TypeError);
        expect(seen).toEqual([]);
    });

    it("null and undefined from an untyped caller throw instead of becoming a literal segment", async () => {
        const { service, seen } = commentsService();
        await expect(service.getComment(null)).rejects.toThrow(TypeError);
        await expect(service.getComment(undefined)).rejects.toThrow(TypeError);
        expect(seen).toEqual([]);
    });

    it("a numeric id is still sent as its decimal segment", async () => {
        const { service, seen, source } = commentsService({ type: "integer" });
        expect(source).toContain("async getComment(id: number): Promise<void>");
        await service.getComment(7);
        expect(seen).toEqual([`GET ${BASE}/api/comments/7`]);
    });

    it.each([
        ["a boolean", { type: "boolean" }, true, "true"],
        ["an array", { type: "array", items: { type: "string" } }, ["a", "b/c"], "a%2Cb%2Fc"],
        ["a nullable string", { type: ["string", "null"] }, "a/b", "a%2Fb"],
    ])("%s path param is encoded too", async (_kind, schema, value, segment) => {
        const { service, seen } = commentsService(schema);
        await service.getComment(value);
        expect(seen).toEqual([`GET ${BASE}/api/comments/${segment}`]);
    });

    it("a nullable path param still rejects null at runtime", async () => {
        const { service, seen } = commentsService({ type: ["string", "null"] });
        await expect(service.getComment(null)).rejects.toThrow(TypeError);
        expect(seen).toEqual([]);
    });
});

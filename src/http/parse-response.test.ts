/**
 * `isDevBuild` is mocked here deliberately, and un-mocking it would undo the fix
 * this file guards. The defect (issue #250) survived every release because the
 * suite let the ambient environment pick the branch: vitest sets `NODE_ENV` to
 * `"test"` and jsdom provides `process`, so the detailed branch was taken for a
 * reason no browser ever reproduces. Steering the branch through the mock keeps
 * both outcomes reachable without `process` existing at all. The real
 * implementation is covered by `src/utils/dev-mode.test.ts`, and the published
 * artifact by `scripts/check-dist-guards.mjs`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { parseResponse } from "./parse-response";
import { isDevBuild } from "../utils/dev-mode";

vi.mock("../utils/dev-mode", () => ({ isDevBuild: vi.fn(() => true) }));

const schema = z.object({ id: z.string(), name: z.string() });

beforeEach(() => {
    vi.mocked(isDevBuild).mockReturnValue(true);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("parseResponse", () => {
    it("returns the parsed payload on success", () => {
        const result = parseResponse(schema, { id: "1", name: "x" }, "GET /x");

        expect(result.id).toBe("1");
        expect(isDevBuild).not.toHaveBeenCalled();
    });

    it("reports the divergent field where `process` does not exist", () => {
        vi.stubGlobal("process", undefined);

        let message = "";
        try {
            parseResponse(schema, { id: "1" }, "GET /users/me");
        } catch (error) {
            message = (error as Error).message;
        }

        expect(message).toContain("[parseResponse] Contract drift on GET /users/me");
        expect(message).toContain("- name:");
        expect(message).toContain("Raw payload:");
    });

    it("names the nested field path, not just the leaf", () => {
        const nested = z.object({ user: z.object({ id: z.string() }) });

        expect(() => parseResponse(nested, { user: { id: 1 } }, "GET /users/me")).toThrow(
            /user\.id/,
        );
    });

    it("labels a root-level issue as <root>", () => {
        expect(() => parseResponse(schema, "not an object", "GET /users/me")).toThrow(/<root>/);
    });

    it("asks isDevBuild only once per failure", () => {
        expect(() => parseResponse(schema, { id: "1" }, "GET /x")).toThrow();
        expect(isDevBuild).toHaveBeenCalledTimes(1);
    });
});

describe("parseResponse — outside a development build", () => {
    it("hides the drift behind a sentence a user can read", () => {
        vi.mocked(isDevBuild).mockReturnValue(false);

        let message = "";
        try {
            parseResponse(z.object({ id: z.number() }), { id: "x" }, "GET /pedidos");
        } catch (error) {
            message = (error as Error).message;
        }

        expect(message).toBe("Resposta inválida do servidor (GET /pedidos).");
        expect(message).not.toContain("Raw payload");
        expect(message).not.toContain("Contract drift");
    });
});

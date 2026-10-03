import { describe, expect, it } from "vitest";
import { describeAppError } from "./describe-app-error";

class UnreadableFileError extends Error {
    constructor(cause?: unknown) {
        super("Não foi possível ler o arquivo da foto.", { cause });
        this.name = "UnreadableFileError";
    }
}

describe("describeAppError", () => {
    it("uses the error's name as the code", () => {
        expect(describeAppError(new UnreadableFileError()).code).toBe("UnreadableFileError");
    });

    it("keeps the cause chain, where the real failure lives", () => {
        const cause = new DOMException("The file could not be read", "NotReadableError");
        const { message } = describeAppError(new UnreadableFileError(cause));
        expect(message.split("\n").slice(0, 2)).toEqual([
            "UnreadableFileError: Não foi possível ler o arquivo da foto.",
            "caused by: NotReadableError: The file could not be read",
        ]);
    });

    it("reads a cross-realm error by shape, cause included", () => {
        const foreign = { name: "NotReadableError", message: "denied", cause: { message: "io" } };
        expect(describeAppError(foreign)).toEqual({
            code: "NotReadableError",
            message: "NotReadableError: denied\ncaused by: Error: io",
        });
    });

    it("puts the context before the stack, so a cut at 4000 loses the stack first", () => {
        const { message } = describeAppError(new Error("boom"), { size: 0, mime: "image/jpeg" });
        const contextAt = message.indexOf('context: {"size":0,"mime":"image/jpeg"}');
        const stackAt = message.indexOf("    at ");
        expect(contextAt).toBeGreaterThan(0);
        expect(stackAt === -1 || stackAt > contextAt).toBe(true);
    });

    it("stops on a circular cause instead of looping", () => {
        const a = new Error("a");
        const b = new Error("b", { cause: a });
        Object.defineProperty(a, "cause", { value: b });
        expect(describeAppError(a).message).toContain("caused by: [circular]");
    });

    it("elides a cause chain deeper than five links", () => {
        let error = new Error("root");
        for (let i = 0; i < 8; i += 1) error = new Error(`level ${i}`, { cause: error });
        const lines = describeAppError(error).message.split("\n");
        expect(lines.filter((line) => line.startsWith("caused by:"))).toHaveLength(6);
        expect(lines).toContain("caused by: […]");
    });

    it("describes a thrown string and a plain object without throwing", () => {
        expect(describeAppError("network down")).toMatchObject({
            code: "Error",
            message: "network down",
        });
        expect(describeAppError({ name: "AbortError", reason: 1 })).toMatchObject({
            code: "AbortError",
            message: '{"name":"AbortError","reason":1}',
        });
    });

    it("survives a value and a context JSON cannot represent", () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        const { message } = describeAppError(cyclic, { cyclic });
        expect(message).toContain("[object Object]");
        expect(message).toContain("context: [unserializable]");
    });

    it("describes undefined, an empty name and a non-error cause without inventing text", () => {
        expect(describeAppError(undefined)).toEqual({ code: "Error", message: "undefined" });
        const nameless = new Error("no name");
        nameless.name = "";
        expect(describeAppError(nameless).code).toBe("Error");
        expect(describeAppError({ name: 7, message: "m" }).code).toBe("Error");
        const withStringCause = new Error("top", { cause: "disk full" });
        expect(describeAppError(withStringCause).message.split("\n")[1]).toBe(
            "caused by: disk full",
        );
    });

    it("omits the context line when the context is empty", () => {
        expect(describeAppError("x", {}).message).toBe("x");
    });
});

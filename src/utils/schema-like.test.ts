import { describe, expect, it } from "vitest";
import { validateWithSchema, type SchemaLike } from "@/utils/schema-like";

describe("validateWithSchema", () => {
    it("joins a nested path with dots, whatever segment shape the vendor uses", () => {
        const schema: SchemaLike<unknown> = {
            "~standard": {
                validate: () => ({
                    issues: [{ message: "bad", path: ["items", 0, { key: "name" }] }],
                }),
            },
        };

        const result = validateWithSchema(schema, {});

        expect(result).toEqual({
            ok: false,
            issues: [{ path: "items.0.name", message: "bad" }],
        });
    });

    it("names a symbol key rather than throwing on it", () => {
        const key = Symbol("secret");
        const schema: SchemaLike<unknown> = {
            "~standard": { validate: () => ({ issues: [{ message: "bad", path: [key] }] }) },
        };

        const result = validateWithSchema(schema, {});

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.issues[0]?.path).toBe("Symbol(secret)");
    });

    it("treats an empty path as the root", () => {
        const schema: SchemaLike<unknown> = {
            "~standard": { validate: () => ({ issues: [{ message: "bad", path: [] }] }) },
        };

        const result = validateWithSchema(schema, {});

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.issues[0]?.path).toBe("<root>");
    });

    it("refuses a thenable result without awaiting it", () => {
        const schema: SchemaLike<number> = {
            "~standard": {
                validate: () => ({ then: () => undefined }) as unknown as { value: number },
            },
        };

        const result = validateWithSchema(schema, 1);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.issues[0]?.message).toContain("asynchronously");
    });

    it("prefers `~standard` when a schema exposes both shapes", () => {
        const schema: SchemaLike<string> = {
            "~standard": { validate: () => ({ value: "from standard" }) },
            safeParse: () => ({ success: true, data: "from safeParse" }),
        } as SchemaLike<string>;

        expect(validateWithSchema(schema, "x")).toEqual({ ok: true, data: "from standard" });
    });
});

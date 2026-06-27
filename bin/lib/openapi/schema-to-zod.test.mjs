import { describe, it, expect } from "vitest";
import { refName, zodName, schemaToZod } from "./schema-to-zod.mjs";

describe("refName / zodName", () => {
    it("extracts the schema name from a $ref", () => {
        expect(refName("#/components/schemas/User")).toBe("User");
    });
    it("builds the zod const name", () => {
        expect(zodName("User")).toBe("UserSchema");
    });
});

describe("schemaToZod — primitives", () => {
    it("string with format", () => {
        expect(schemaToZod({ type: "string" })).toBe("z.string()");
        expect(schemaToZod({ type: "string", format: "email" })).toBe("z.string().email()");
        expect(schemaToZod({ type: "string", format: "uuid" })).toBe("z.string().uuid()");
        expect(schemaToZod({ type: "string", format: "date-time" })).toBe(
            "z.string().datetime({ offset: true })",
        );
    });
    it("integer vs number", () => {
        expect(schemaToZod({ type: "integer" })).toBe("z.number().int()");
        expect(schemaToZod({ type: "number", minimum: 0 })).toBe("z.number().min(0)");
    });
    it("boolean", () => {
        expect(schemaToZod({ type: "boolean" })).toBe("z.boolean()");
    });
});

describe("schemaToZod — $ref / nullable / enum", () => {
    it("$ref → ZodName", () => {
        expect(schemaToZod({ $ref: "#/components/schemas/User" })).toBe("UserSchema");
    });
    it("nullable (3.0)", () => {
        expect(schemaToZod({ type: "string", nullable: true })).toBe("z.string().nullable()");
    });
    it("nullable (3.1 type array)", () => {
        expect(schemaToZod({ type: ["string", "null"] })).toBe("z.string().nullable()");
    });
    it("string enum", () => {
        expect(schemaToZod({ type: "string", enum: ["a", "b"] })).toBe('z.enum(["a", "b"])');
    });
});

describe("schemaToZod — array / object", () => {
    it("array of refs", () => {
        expect(schemaToZod({ type: "array", items: { $ref: "#/components/schemas/User" } })).toBe(
            "z.array(UserSchema)",
        );
    });
    it("object with required + optional", () => {
        const out = schemaToZod({
            type: "object",
            required: ["id"],
            properties: { id: { type: "integer" }, name: { type: "string" } },
        });
        expect(out).toContain('"id": z.number().int(),');
        expect(out).toContain('"name": z.string().optional(),');
        expect(out.startsWith("z.object({")).toBe(true);
    });
    it("record for additionalProperties schema", () => {
        expect(schemaToZod({ type: "object", additionalProperties: { type: "number" } })).toBe(
            "z.record(z.string(), z.number())",
        );
    });
});

describe("schemaToZod — composition", () => {
    it("anyOf → union", () => {
        expect(schemaToZod({ anyOf: [{ type: "string" }, { type: "number" }] })).toBe(
            "z.union([z.string(), z.number()])",
        );
    });
    it("allOf → intersection", () => {
        const out = schemaToZod({
            allOf: [{ $ref: "#/components/schemas/A" }, { $ref: "#/components/schemas/B" }],
        });
        expect(out).toBe("z.intersection(ASchema, BSchema)");
    });
});

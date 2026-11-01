import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validateForm } from "./validate-form";

const schema = z.object({
    email: z.string().email(),
    age: z.number().min(18),
});

describe("validateForm", () => {
    it("returns data when valid", () => {
        const result = validateForm(schema, { email: "a@b.com", age: 21 });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.email).toBe("a@b.com");
    });

    it("returns flat error map keyed by path", () => {
        const result = validateForm(schema, { email: "nope", age: 12 });
        expect(result.success).toBe(false);
        expect(result.errors.email).toBeTruthy();
        expect(result.errors.age).toBeTruthy();
    });

    it("dedupes multiple issues per path to first message", () => {
        const stricter = z.object({
            name: z
                .string()
                .min(2)
                .regex(/^[a-z]+$/),
        });
        const result = validateForm(stricter, { name: "" });
        expect(Object.keys(result.errors)).toEqual(["name"]);
    });
});

describe("validateForm — fields named like Object.prototype members", () => {
    const inherited = z
        .object({
            constructor: z.string().min(1, "constructor obrigatório"),
            toString: z.string().min(1, "toString obrigatório"),
        })
        .superRefine((_, context) => {
            context.addIssue({
                code: "custom",
                path: ["__proto__"],
                message: "__proto__ inválido",
            });
        });

    it("keeps the message of every field and leaves the map's prototype alone", () => {
        const result = validateForm(inherited, { constructor: "", toString: "" });
        expect(result.success).toBe(false);
        expect(Object.getPrototypeOf(result.errors)).toBe(Object.prototype);
        expect(Object.keys(result.errors).sort()).toEqual(["__proto__", "constructor", "toString"]);
        expect(result.errors.constructor).toBe("constructor obrigatório");
        expect(result.errors.toString).toBe("toString obrigatório");
        expect(Object.getOwnPropertyDescriptor(result.errors, "__proto__")?.value).toBe(
            "__proto__ inválido",
        );
    });
});

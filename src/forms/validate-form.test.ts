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

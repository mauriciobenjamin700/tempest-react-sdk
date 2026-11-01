import type { FieldValues, ResolverOptions } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodResolver } from "./zod-resolver";

const schema = z.object({ name: z.string().min(2) });

/**
 * The `ResolverOptions` react-hook-form would pass, reduced to what the
 * resolver reads. `fields` and `shouldUseNativeValidation` are required by the
 * contract and ignored by the implementation.
 */
export function resolverOptions<TValues extends FieldValues>(
    criteriaMode: "firstError" | "all",
): ResolverOptions<TValues> {
    return { criteriaMode, fields: {}, shouldUseNativeValidation: false };
}

describe("zodResolver", () => {
    it("returns values when valid", async () => {
        const resolver = zodResolver(schema);
        const result = await resolver({ name: "Ana" }, undefined, resolverOptions("firstError"));
        expect(result.values).toEqual({ name: "Ana" });
        expect(result.errors).toEqual({});
    });

    it("returns errors keyed by path when invalid", async () => {
        const resolver = zodResolver(schema);
        const result = await resolver({ name: "" }, undefined, resolverOptions("firstError"));
        expect(result.values).toEqual({});
        expect(result.errors.name).toBeDefined();
    });
});

describe("zodResolver — fields named like Object.prototype members", () => {
    const inherited = z
        .object({ constructor: z.string().min(1, "constructor obrigatório") })
        .superRefine((_, context) => {
            context.addIssue({
                code: "custom",
                path: ["__proto__"],
                message: "__proto__ inválido",
            });
        });

    it.each(["firstError", "all"] as const)(
        "reports each field's own message in %s mode",
        async (mode) => {
            const result = await zodResolver(inherited)(
                { constructor: "" } as never,
                undefined,
                resolverOptions(mode),
            );
            const errors = result.errors as Record<string, unknown>;
            expect(Object.getPrototypeOf(errors)).toBe(Object.prototype);
            expect(Object.getOwnPropertyDescriptor(errors, "constructor")?.value).toEqual({
                type: "too_small",
                message: "constructor obrigatório",
            });
            expect(Object.getOwnPropertyDescriptor(errors, "__proto__")?.value).toEqual({
                type: "custom",
                message: "__proto__ inválido",
            });
        },
    );
});

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

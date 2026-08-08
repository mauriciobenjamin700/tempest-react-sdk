import type { FieldValues } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resolverOptions } from "./zod-resolver.test";
import { zodResolver } from "./zod-resolver";

const schema = z.object({
    email: z.string().email(),
    age: z.number().min(18),
});

describe("zodResolver criteriaMode", () => {
    it("collects all issues when criteriaMode=all", async () => {
        const resolver = zodResolver(schema);
        const result = await resolver({ email: "no", age: 12 }, undefined, resolverOptions("all"));
        expect(Object.keys(result.errors)).toEqual(expect.arrayContaining(["email", "age"]));
    });

    it("uses _root for root-level errors", async () => {
        const rootSchema = z.tuple([z.string()]);
        const resolver = zodResolver(rootSchema);
        const result = await resolver(
            "not-tuple" as unknown as [string] & FieldValues,
            undefined,
            resolverOptions("firstError"),
        );
        expect(Object.keys(result.errors)).toContain("_root");
    });
});

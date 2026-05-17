import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodResolver } from "./zod-resolver";

const schema = z.object({ name: z.string().min(2) });

describe("zodResolver", () => {
    it("returns values when valid", async () => {
        const resolver = zodResolver(schema);
        const result = await resolver({ name: "Ana" }, undefined, { criteriaMode: "firstError" });
        expect(result.values).toEqual({ name: "Ana" });
        expect(result.errors).toEqual({});
    });

    it("returns errors keyed by path when invalid", async () => {
        const resolver = zodResolver(schema);
        const result = await resolver({ name: "" }, undefined, { criteriaMode: "firstError" });
        expect(result.values).toEqual({});
        expect(result.errors.name).toBeDefined();
    });
});

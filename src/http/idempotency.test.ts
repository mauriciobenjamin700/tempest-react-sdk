import { describe, expect, it } from "vitest";
import { generateIdempotencyKey } from "./idempotency";

describe("generateIdempotencyKey", () => {
    it("returns a v4-shaped UUID", () => {
        const key = generateIdempotencyKey();
        expect(key).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
    });

    it("returns distinct values across calls", () => {
        expect(generateIdempotencyKey()).not.toBe(generateIdempotencyKey());
    });
});

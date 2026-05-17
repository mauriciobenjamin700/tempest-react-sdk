import { afterEach, describe, expect, it } from "vitest";
import { generateIdempotencyKey } from "./idempotency";

describe("generateIdempotencyKey fallback", () => {
    const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");

    afterEach(() => {
        if (originalCrypto) Object.defineProperty(globalThis, "crypto", originalCrypto);
    });

    it("falls back to Math.random when crypto.randomUUID is unavailable", () => {
        Object.defineProperty(globalThis, "crypto", {
            configurable: true,
            value: {},
        });
        const key = generateIdempotencyKey();
        expect(key).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
    });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { randomId } from "./ids";

describe("randomId", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns a non-empty unique string", () => {
        const a = randomId();
        const b = randomId();
        expect(a).toBeTruthy();
        expect(typeof a).toBe("string");
        expect(a).not.toBe(b);
    });

    it("prefixes the id when a prefix is given", () => {
        const id = randomId("user");
        expect(id.startsWith("user-")).toBe(true);
    });

    it("uses crypto.randomUUID when available", () => {
        const spy = vi
            .spyOn(crypto, "randomUUID")
            .mockReturnValue("11111111-1111-1111-1111-111111111111");
        expect(randomId()).toBe("11111111-1111-1111-1111-111111111111");
        expect(spy).toHaveBeenCalled();
    });

    it("falls back when randomUUID is unavailable", () => {
        const original = crypto.randomUUID;
        // @ts-expect-error - intentionally removing to exercise the fallback path
        crypto.randomUUID = undefined;
        try {
            const id = randomId("item");
            expect(id.startsWith("item-")).toBe(true);
            expect(id.length).toBeGreaterThan("item-".length);
        } finally {
            crypto.randomUUID = original;
        }
    });
});

import { describe, expect, it } from "vitest";
import {
    appErrorOwner,
    fingerprintAppErrorOwner,
    FNV_OFFSET_BASIS_32,
    FNV_PRIME_32,
} from "./app-error-owner";

describe("app error owner", () => {
    it("pins the FNV-1a 32-bit constants from the specification", () => {
        expect(FNV_OFFSET_BASIS_32).toBe(2166136261);
        expect(FNV_PRIME_32).toBe(16777619);
    });

    it("hashes the first half exactly like reference FNV-1a 32", () => {
        expect(fingerprintAppErrorOwner("").slice(0, 8)).toBe("811c9dc5");
        expect(fingerprintAppErrorOwner("a").slice(0, 8)).toBe("e40c292c");
        expect(fingerprintAppErrorOwner("foobar").slice(0, 8)).toBe("bf9cf968");
    });

    it("gives 16 hex characters that tell two identities apart", () => {
        const alice = fingerprintAppErrorOwner("user-alice");
        expect(alice).toMatch(/^[0-9a-f]{16}$/);
        expect(alice).toBe(fingerprintAppErrorOwner("user-alice"));
        expect(alice).not.toBe(fingerprintAppErrorOwner("user-bob"));
    });

    it("keeps principal and token owners from matching each other", () => {
        expect(appErrorOwner("p", "same")).not.toBe(appErrorOwner("t", "same"));
        expect(appErrorOwner("p", "")).toBeNull();
        expect(appErrorOwner("t", undefined)).toBeNull();
    });
});

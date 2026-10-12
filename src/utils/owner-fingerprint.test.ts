import { describe, expect, it } from "vitest";
import {
    ownerFingerprint,
    fingerprintOwner,
    FNV_OFFSET_BASIS_32,
    FNV_PRIME_32,
} from "./owner-fingerprint";

describe("owner fingerprint", () => {
    it("pins the FNV-1a 32-bit constants from the specification", () => {
        expect(FNV_OFFSET_BASIS_32).toBe(2166136261);
        expect(FNV_PRIME_32).toBe(16777619);
    });

    it("hashes the first half exactly like reference FNV-1a 32", () => {
        expect(fingerprintOwner("").slice(0, 8)).toBe("811c9dc5");
        expect(fingerprintOwner("a").slice(0, 8)).toBe("e40c292c");
        expect(fingerprintOwner("foobar").slice(0, 8)).toBe("bf9cf968");
    });

    it("gives 16 hex characters that tell two identities apart", () => {
        const alice = fingerprintOwner("user-alice");
        expect(alice).toMatch(/^[0-9a-f]{16}$/);
        expect(alice).toBe(fingerprintOwner("user-alice"));
        expect(alice).not.toBe(fingerprintOwner("user-bob"));
    });

    it("keeps principal and token owners from matching each other", () => {
        expect(ownerFingerprint("p", "same")).not.toBe(ownerFingerprint("t", "same"));
        expect(ownerFingerprint("p", "")).toBeNull();
        expect(ownerFingerprint("t", undefined)).toBeNull();
    });

    it("accepts only a string or a finite number as an identity", () => {
        expect(ownerFingerprint("p", Promise.resolve("a"))).toBeNull();
        expect(ownerFingerprint("p", { id: "a" })).toBeNull();
        expect(ownerFingerprint("p", Number.NaN)).toBeNull();
        expect(ownerFingerprint("p", 42)).toBe(ownerFingerprint("p", "42"));
    });
});

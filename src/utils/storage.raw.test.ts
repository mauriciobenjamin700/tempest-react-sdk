import { afterEach, describe, expect, it, vi } from "vitest";

import { compressedStorage } from "./compressed-storage";
import { createJsonStorage, storage } from "./storage";

/**
 * The raw pair, and the migration defect it exists to prevent.
 *
 * `get`/`set` run the codec both ways, so a key an app already holds — written
 * as a bare `dark` — reads back as the fallback and is overwritten as `"dark"`
 * with quotes. Nothing throws and nothing logs: the preference resets, and when
 * the key is a refresh token the session ends.
 */
describe("storage raw access", () => {
    afterEach(() => window.localStorage.clear());

    it("reads a bare string the codec cannot parse", () => {
        window.localStorage.setItem("tempest-theme", "dark");

        expect(storage.get("tempest-theme", "system")).toBe("system");
        expect(storage.getRaw("tempest-theme")).toBe("dark");
    });

    it("writes a bare string, so an existing reader keeps working", () => {
        storage.setRaw("tempest-theme", "dark");

        expect(window.localStorage.getItem("tempest-theme")).toBe("dark");
    });

    it("keeps the encoded pair encoding, which is the difference being documented", () => {
        storage.set("tempest-theme", "dark");

        expect(window.localStorage.getItem("tempest-theme")).toBe('"dark"');
    });

    it("returns null for an absent key", () => {
        expect(storage.getRaw("missing")).toBeNull();
    });

    it("round-trips through the raw pair", () => {
        storage.setRaw("token", "eyJhbGciOiJIUzI1NiJ9.payload.sig");

        expect(storage.getRaw("token")).toBe("eyJhbGciOiJIUzI1NiJ9.payload.sig");
    });

    it("bypasses the codec of a store that has one", () => {
        compressedStorage.set("doc", { title: "Sem título" });
        const stored = window.localStorage.getItem("doc");

        expect(compressedStorage.getRaw("doc")).toBe(stored);
        expect(compressedStorage.getRaw("doc")).not.toContain("Sem título");
    });

    it("is available on every store createJsonStorage builds", () => {
        const store = createJsonStorage();

        expect(typeof store.getRaw).toBe("function");
        expect(typeof store.setRaw).toBe("function");
    });
});

describe("storage raw access — unavailable backend", () => {
    it("getRaw returns null when localStorage throws", () => {
        const spy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
            throw new Error("disabled");
        });

        expect(storage.getRaw("k")).toBeNull();
        spy.mockRestore();
    });

    it("setRaw swallows a quota error like every other write", () => {
        const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
            throw new Error("QuotaExceeded");
        });

        expect(() => storage.setRaw("k", "v")).not.toThrow();
        spy.mockRestore();
    });
});

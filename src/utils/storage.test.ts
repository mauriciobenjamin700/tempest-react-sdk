import { afterEach, describe, expect, it, vi } from "vitest";
import { storage } from "./storage";

describe("storage", () => {
    afterEach(() => window.localStorage.clear());

    it("returns the fallback when key is absent", () => {
        expect(storage.get("missing", "fallback")).toBe("fallback");
    });

    it("round-trips JSON values", () => {
        storage.set("k", { a: 1, b: [true, "x"] });
        expect(storage.get("k", null)).toEqual({ a: 1, b: [true, "x"] });
    });

    it("removes values", () => {
        storage.set("k", "v");
        storage.remove("k");
        expect(storage.get("k", "fallback")).toBe("fallback");
    });

    it("returns fallback when stored value is invalid JSON", () => {
        window.localStorage.setItem("bad", "not-json{");
        expect(storage.get("bad", "fallback")).toBe("fallback");
    });
});

describe("storage — unavailable backend", () => {
    it("degrades to null/no-op when localStorage throws", () => {
        const getItem = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        const removeItem = vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
            throw new Error("blocked");
        });

        expect(storage.get("k", "fallback")).toBe("fallback");
        expect(() => storage.set("k", { a: 1 })).not.toThrow();
        expect(() => storage.remove("k")).not.toThrow();

        getItem.mockRestore();
        setItem.mockRestore();
        removeItem.mockRestore();
    });

    it("returns the fallback for a malformed stored value", () => {
        window.localStorage.setItem("bad-json", "{oops");
        expect(storage.get("bad-json", 7)).toBe(7);
    });
});

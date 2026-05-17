import { describe, expect, it, vi } from "vitest";
import { storage } from "./storage";

describe("storage SSR-safety", () => {
    it("get returns fallback when localStorage throws", () => {
        const spy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
            throw new Error("disabled");
        });
        expect(storage.get("k", "fallback")).toBe("fallback");
        spy.mockRestore();
    });

    it("set silently swallows quota errors", () => {
        const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
            throw new Error("QuotaExceeded");
        });
        expect(() => storage.set("k", { big: "x" })).not.toThrow();
        spy.mockRestore();
    });

    it("remove silently swallows errors", () => {
        const spy = vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
            throw new Error("nope");
        });
        expect(() => storage.remove("k")).not.toThrow();
        spy.mockRestore();
    });
});

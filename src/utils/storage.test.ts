import { afterEach, describe, expect, it } from "vitest";
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

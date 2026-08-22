import { afterEach, describe, expect, it, vi } from "vitest";
import { compressedStorage } from "./compressed-storage";
import { createJsonStorage, storage, type StorageCodec } from "./storage";

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

describe("storage — no window", () => {
    it("returns the fallback and no-ops without a window", () => {
        const original = globalThis.window;
        vi.stubGlobal("window", undefined);

        expect(storage.get("k", "fallback")).toBe("fallback");
        expect(() => storage.set("k", 1)).not.toThrow();
        expect(() => storage.remove("k")).not.toThrow();

        vi.stubGlobal("window", original);
    });
});

/**
 * One implementation behind every store, so they cannot drift in surface.
 *
 * `compressedStorage` used to be a hand-written copy of these guards, and it had
 * no `remove` — while promising in its own docstring that the two were
 * interchangeable at the call site. Anybody who followed that broke on the first
 * `remove`.
 */
describe("createJsonStorage", () => {
    afterEach(() => window.localStorage.clear());

    /** A codec that stores text backwards, so encoding is observable. */
    const reversed: StorageCodec = {
        serialize: (value) => [...JSON.stringify(value)].reverse().join(""),
        deserialize: (raw) => JSON.parse([...raw].reverse().join("")),
    };

    it("round-trips through the codec it was given", () => {
        const store = createJsonStorage(reversed);
        store.set("k", { a: 1 });

        expect(window.localStorage.getItem("k")).toBe('}1:"a"{');
        expect(store.get("k", null)).toEqual({ a: 1 });
    });

    it("defaults to plain JSON", () => {
        createJsonStorage().set("k", { a: 1 });
        expect(window.localStorage.getItem("k")).toBe('{"a":1}');
    });

    it("gives every store the same surface, `remove` included", () => {
        for (const store of [storage, compressedStorage, createJsonStorage(reversed)]) {
            store.set("k", "value");
            expect(store.get("k", "fallback")).toBe("value");
            store.remove("k");
            expect(store.get("k", "fallback")).toBe("fallback");
        }
    });

    it("degrades to plain JSON when the codec itself throws", () => {
        const broken: StorageCodec = {
            serialize: () => {
                throw new Error("out of room");
            },
            deserialize: (raw) => JSON.parse(raw),
        };

        createJsonStorage(broken).set("k", { a: 1 });

        expect(window.localStorage.getItem("k")).toBe('{"a":1}');
    });

    it("drops the write when not even JSON can represent the value", () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;

        expect(() => createJsonStorage().set("k", cyclic)).not.toThrow();
        expect(window.localStorage.getItem("k")).toBeNull();
    });

    it("returns the fallback on a corrupt record instead of throwing", () => {
        window.localStorage.setItem("k", "not json");
        expect(createJsonStorage().get("k", "fallback")).toBe("fallback");
    });
});

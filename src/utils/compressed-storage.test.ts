import { afterEach, describe, expect, it, vi } from "vitest";
import {
    compressToString,
    compressedStorage,
    compressedStorageCodec,
    decompressFromString,
} from "./compressed-storage";

const MARKER = "~tgz1:";

afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
});

describe("compressToString / decompressFromString", () => {
    it("round-trips objects, arrays and primitives", () => {
        const value = { id: 7, tags: ["a", "b"], nested: { ok: true, n: null } };
        expect(decompressFromString(compressToString(value))).toEqual(value);
        expect(decompressFromString(compressToString([1, 2, 3]))).toEqual([1, 2, 3]);
        expect(decompressFromString(compressToString("plain"))).toBe("plain");
        expect(decompressFromString(compressToString(42))).toBe(42);
    });

    it("stamps the format marker so the payload is self-describing", () => {
        expect(compressToString({ a: 1 }).startsWith(MARKER)).toBe(true);
    });

    it("survives non-ASCII text", () => {
        const value = { nome: "Jomásio", emoji: "🎮", ja: "アドベンチャー" };
        expect(decompressFromString(compressToString(value))).toEqual(value);
    });

    it("actually shrinks a repetitive payload", () => {
        const value = Array.from({ length: 500 }, (_, i) => ({
            id: i,
            kind: "inventory-item",
            quantity: 1,
        }));
        const raw = JSON.stringify(value);
        expect(compressToString(value).length).toBeLessThan(raw.length / 2);
    });

    it("reads a plain JSON value written before compression existed", () => {
        expect(decompressFromString<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
        expect(decompressFromString<number[]>("[1,2]")).toEqual([1, 2]);
    });

    it("handles a payload large enough to break a splatted fromCharCode", () => {
        const value = Array.from({ length: 60_000 }, (_, i) => i);
        expect(decompressFromString(compressToString(value))).toEqual(value);
    });

    it("throws on a payload that is neither compressed nor JSON", () => {
        expect(() => decompressFromString("not json at all")).toThrow();
        expect(() => decompressFromString(`${MARKER}!!!not-base64!!!`)).toThrow();
    });
});

describe("compressedStorageCodec", () => {
    it("exposes the same pair as the standalone functions", () => {
        const value = { hp: 90 };
        expect(compressedStorageCodec.deserialize(compressedStorageCodec.serialize(value))).toEqual(
            value,
        );
    });
});

describe("compressedStorage", () => {
    it("writes compressed and reads back", () => {
        compressedStorage.set("save", { level: 3 });
        expect(window.localStorage.getItem("save")?.startsWith(MARKER)).toBe(true);
        expect(compressedStorage.get("save", null)).toEqual({ level: 3 });
    });

    it("returns the fallback for a missing key", () => {
        expect(compressedStorage.get("absent", "fallback")).toBe("fallback");
    });

    it("returns the fallback for a corrupt value instead of throwing", () => {
        window.localStorage.setItem("save", `${MARKER}zzzz`);
        expect(compressedStorage.get("save", "fallback")).toBe("fallback");
    });

    it("reads a legacy uncompressed value", () => {
        window.localStorage.setItem("save", '{"level":9}');
        expect(compressedStorage.get("save", null)).toEqual({ level: 9 });
    });

    it("falls back to plain JSON when compression fails, rather than dropping the write", () => {
        const encoder = vi.spyOn(TextEncoder.prototype, "encode").mockImplementation(() => {
            throw new Error("boom");
        });

        compressedStorage.set("save", { level: 4 });
        encoder.mockRestore();

        expect(window.localStorage.getItem("save")).toBe('{"level":4}');
        expect(compressedStorage.get("save", null)).toEqual({ level: 4 });
    });

    it("swallows a quota failure on write", () => {
        vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
            throw new Error("QuotaExceeded");
        });
        expect(() => compressedStorage.set("save", { level: 5 })).not.toThrow();
    });

    it("returns the fallback when localStorage itself throws on read", () => {
        vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
            throw new Error("disabled");
        });
        expect(compressedStorage.get("save", "fallback")).toBe("fallback");
    });
});

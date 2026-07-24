import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalStorage } from "./use-local-storage";

describe("useLocalStorage", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("returns default when nothing stored", () => {
        const { result } = renderHook(() => useLocalStorage("k", 42));
        expect(result.current[0]).toBe(42);
    });

    it("persists set value to localStorage", () => {
        const { result } = renderHook(() => useLocalStorage("k", "a"));
        act(() => result.current[1]("b"));
        expect(result.current[0]).toBe("b");
        expect(window.localStorage.getItem("k")).toBe('"b"');
    });

    it("supports updater function", () => {
        const { result } = renderHook(() => useLocalStorage("k", 1));
        act(() => result.current[1]((prev) => prev + 1));
        expect(result.current[0]).toBe(2);
    });

    it("remove resets to default and clears storage", () => {
        const { result } = renderHook(() => useLocalStorage("k", "a"));
        act(() => result.current[1]("b"));
        act(() => result.current[2]());
        expect(result.current[0]).toBe("a");
        expect(window.localStorage.getItem("k")).toBeNull();
    });

    it("reads existing stored value on mount", () => {
        window.localStorage.setItem("k", '"existing"');
        const { result } = renderHook(() => useLocalStorage("k", "default"));
        expect(result.current[0]).toBe("existing");
    });
});

describe("useLocalStorage — hydration, custom codecs and cross-tab", () => {
    beforeEach(() => window.localStorage.clear());

    it("hydrates an existing stored value", () => {
        window.localStorage.setItem("k", '"stored"');
        const { result } = renderHook(() => useLocalStorage("k", "fallback"));
        expect(result.current[0]).toBe("stored");
    });

    it("falls back to the default when the stored value is malformed", () => {
        window.localStorage.setItem("k", "{not json");
        const { result } = renderHook(() => useLocalStorage("k", "fallback"));
        expect(result.current[0]).toBe("fallback");
    });

    it("uses custom serialize/deserialize", () => {
        const { result } = renderHook(() =>
            useLocalStorage("k", 0, {
                serialize: (value) => `#${value}`,
                deserialize: (raw) => Number(raw.slice(1)),
            }),
        );
        act(() => result.current[1](7));
        expect(window.localStorage.getItem("k")).toBe("#7");
        expect(result.current[0]).toBe(7);
    });

    it("remove() clears the key and resets to the default", () => {
        const { result } = renderHook(() => useLocalStorage("k", "def"));
        act(() => result.current[1]("other"));
        act(() => result.current[2]());
        expect(window.localStorage.getItem("k")).toBeNull();
        expect(result.current[0]).toBe("def");
    });

    it("picks up a value written by another tab", () => {
        const { result } = renderHook(() => useLocalStorage("k", "a"));
        act(() => {
            window.dispatchEvent(
                new StorageEvent("storage", { key: "k", newValue: '"from-other-tab"' }),
            );
        });
        expect(result.current[0]).toBe("from-other-tab");
    });

    it("resets to the default when another tab removes the key", () => {
        const { result } = renderHook(() => useLocalStorage("k", "a"));
        act(() => result.current[1]("b"));
        act(() => {
            window.dispatchEvent(new StorageEvent("storage", { key: "k", newValue: null }));
        });
        expect(result.current[0]).toBe("a");
    });

    it("ignores storage events for other keys and malformed payloads", () => {
        const { result } = renderHook(() => useLocalStorage("k", "a"));
        act(() => result.current[1]("b"));
        act(() => {
            window.dispatchEvent(new StorageEvent("storage", { key: "other", newValue: '"nope"' }));
            window.dispatchEvent(new StorageEvent("storage", { key: "k", newValue: "{bad" }));
        });
        expect(result.current[0]).toBe("b");
    });

    it("survives a localStorage that throws on write", () => {
        const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
            throw new Error("quota");
        });
        const { result } = renderHook(() => useLocalStorage("k", "a"));
        act(() => result.current[1]("b"));
        expect(result.current[0]).toBe("b");
        setItem.mockRestore();
    });

    it("survives a localStorage that throws on read and on remove", () => {
        const getItem = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        const { result } = renderHook(() => useLocalStorage("k", "safe"));
        expect(result.current[0]).toBe("safe");
        getItem.mockRestore();

        const removeItem = vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        act(() => result.current[2]());
        expect(result.current[0]).toBe("safe");
        removeItem.mockRestore();
    });
});

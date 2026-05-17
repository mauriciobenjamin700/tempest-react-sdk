import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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

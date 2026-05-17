import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useOnline } from "./use-online";

describe("useOnline", () => {
    it("reflects navigator.onLine", () => {
        const { result } = renderHook(() => useOnline());
        expect(typeof result.current).toBe("boolean");
    });

    it("updates on online/offline events", () => {
        const { result } = renderHook(() => useOnline());
        act(() => {
            window.dispatchEvent(new Event("offline"));
        });
        expect(result.current).toBe(false);
        act(() => {
            window.dispatchEvent(new Event("online"));
        });
        expect(result.current).toBe(true);
    });
});

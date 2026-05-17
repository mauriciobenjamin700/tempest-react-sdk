import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDocumentVisibility } from "./use-document-visibility";

describe("useDocumentVisibility events", () => {
    it("reacts to visibilitychange", () => {
        const { result } = renderHook(() => useDocumentVisibility());
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "hidden",
        });
        act(() => {
            document.dispatchEvent(new Event("visibilitychange"));
        });
        expect(result.current).toBe("hidden");
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "visible",
        });
        act(() => {
            document.dispatchEvent(new Event("visibilitychange"));
        });
        expect(result.current).toBe("visible");
    });
});

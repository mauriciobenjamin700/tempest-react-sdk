import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDocumentVisibility } from "./use-document-visibility";

describe("useDocumentVisibility", () => {
    it("returns visible by default", () => {
        const { result } = renderHook(() => useDocumentVisibility());
        expect(result.current).toBe("visible");
    });
});

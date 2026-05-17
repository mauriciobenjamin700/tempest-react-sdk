import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { useFocusTrap } from "./use-focus-trap";

describe("useFocusTrap", () => {
    it("does nothing when inactive", () => {
        const { result } = renderHook(() => {
            const ref = useRef<HTMLDivElement>(null);
            useFocusTrap(ref, false);
            return ref;
        });
        expect(result.current).toBeDefined();
    });
});

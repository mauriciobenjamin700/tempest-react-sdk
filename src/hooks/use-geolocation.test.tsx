import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useGeolocation } from "./use-geolocation";

describe("useGeolocation", () => {
    it("does not crash when disabled", () => {
        const { result } = renderHook(() => useGeolocation({ disabled: true }));
        expect(result.current.loading).toBe(false);
        expect(result.current.coords).toBeNull();
    });
});

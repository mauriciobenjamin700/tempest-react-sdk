import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStableCallback } from "./use-stable-callback";

describe("useStableCallback", () => {
    it("keeps reference stable across rerenders", () => {
        const { result, rerender } = renderHook(
            ({ fn }: { fn: () => number }) => useStableCallback(fn),
            { initialProps: { fn: () => 1 } },
        );
        const first = result.current;
        rerender({ fn: () => 2 });
        expect(result.current).toBe(first);
    });

    it("invokes the latest callback", () => {
        const { result, rerender } = renderHook(
            ({ fn }: { fn: () => number }) => useStableCallback(fn),
            { initialProps: { fn: () => 1 } },
        );
        expect(result.current()).toBe(1);
        rerender({ fn: () => 99 });
        expect(result.current()).toBe(99);
    });
});

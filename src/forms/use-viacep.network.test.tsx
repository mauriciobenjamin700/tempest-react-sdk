import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useViaCEP } from "./use-viacep";

describe("useViaCEP network error", () => {
    it("sets error when fetch throws", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net down")));
        const { result } = renderHook(() => useViaCEP());
        await act(async () => {
            await result.current.lookup("01310-100");
        });
        expect(result.current.error).toBe("net down");
        vi.unstubAllGlobals();
    });

    it("reset() clears error/data", async () => {
        const { result } = renderHook(() => useViaCEP());
        await act(async () => {
            await result.current.lookup("invalid");
        });
        expect(result.current.error).toBeTruthy();
        act(() => result.current.reset());
        expect(result.current.error).toBeNull();
        expect(result.current.data).toBeNull();
    });
});

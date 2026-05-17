import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useClipboard } from "./use-clipboard";

describe("useClipboard fallback paths", () => {
    const originalClipboard = navigator.clipboard;

    afterEach(() => {
        Object.assign(navigator, { clipboard: originalClipboard });
    });

    it("returns false when copy throws", async () => {
        Object.assign(navigator, {
            clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
        });
        const { result } = renderHook(() => useClipboard());
        let ok!: boolean;
        await act(async () => {
            ok = await result.current.copy("x");
        });
        expect(ok).toBe(false);
    });

    it("reset() clears copied flag", async () => {
        Object.assign(navigator, {
            clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
        });
        const { result } = renderHook(() => useClipboard({ resetAfter: 10_000 }));
        await act(async () => {
            await result.current.copy("y");
        });
        expect(result.current.copied).toBe(true);
        act(() => result.current.reset());
        expect(result.current.copied).toBe(false);
    });
});

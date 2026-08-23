import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useClipboard } from "./use-clipboard";

describe("useClipboard", () => {
    it("copies via navigator.clipboard and toggles `copied`", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });

        const { result } = renderHook(() => useClipboard({ resetAfter: 50 }));
        expect(result.current.copied).toBe(false);

        await act(async () => {
            const ok = await result.current.copy("hello");
            expect(ok).toBe(true);
        });
        expect(writeText).toHaveBeenCalledWith("hello");
        expect(result.current.copied).toBe(true);

        await waitFor(() => expect(result.current.copied).toBe(false), { timeout: 200 });
    });

    it("restarts the reset countdown when the user copies again", async () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useClipboard({ resetAfter: 2000 }));

        await act(async () => {
            await result.current.copy("um");
        });
        act(() => {
            vi.advanceTimersByTime(1500);
        });
        await act(async () => {
            await result.current.copy("dois");
        });
        act(() => {
            vi.advanceTimersByTime(1500);
        });

        expect(result.current.copied, "the first countdown was cancelled").toBe(true);

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current.copied).toBe(false);
        vi.useRealTimers();
    });
});

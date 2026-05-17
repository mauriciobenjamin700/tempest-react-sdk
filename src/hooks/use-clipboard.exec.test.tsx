import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useClipboard } from "./use-clipboard";

describe("useClipboard execCommand fallback", () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, "clipboard");

    afterEach(() => {
        if (original) Object.defineProperty(navigator, "clipboard", original);
    });

    it("falls back to document.execCommand when clipboard API absent", async () => {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: undefined,
        });
        const execCommand = vi.fn().mockReturnValue(true);
        Object.defineProperty(document, "execCommand", {
            configurable: true,
            writable: true,
            value: execCommand,
        });
        const { result } = renderHook(() => useClipboard());
        let ok!: boolean;
        await act(async () => {
            ok = await result.current.copy("fallback-text");
        });
        expect(ok).toBe(true);
        expect(execCommand).toHaveBeenCalledWith("copy");
    });
});

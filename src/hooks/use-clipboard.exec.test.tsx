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

    it("reports a refused execCommand as a failed copy instead of flipping copied on", async () => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
        Object.defineProperty(document, "execCommand", {
            configurable: true,
            writable: true,
            value: vi.fn().mockReturnValue(false),
        });
        const { result } = renderHook(() => useClipboard());
        let ok!: boolean;
        await act(async () => {
            ok = await result.current.copy("refused");
        });
        expect(ok).toBe(false);
        expect(result.current.copied).toBe(false);
    });

    it("tries execCommand when the Clipboard API rejects, as in a web view without permission", async () => {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
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
            ok = await result.current.copy("web-view");
        });
        expect(ok).toBe(true);
        expect(execCommand).toHaveBeenCalledWith("copy");
        expect(result.current.copied).toBe(true);
    });
});

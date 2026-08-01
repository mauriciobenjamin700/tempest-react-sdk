/**
 * Tests for the imaging hooks.
 *
 * What is under test is lifecycle, not pixels: the object URL that must be
 * revoked, and the state update that must not land after unmount.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resizeMock = vi.fn(async () => ({
    blob: new Blob([new Uint8Array(10)], { type: "image/jpeg" }),
    width: 100,
    height: 50,
    type: "image/jpeg",
    bytes: 10,
}));

const compressMock = vi.fn(async () => ({
    blob: new Blob([new Uint8Array(5)], { type: "image/jpeg" }),
    width: 100,
    height: 50,
    type: "image/jpeg",
    bytes: 5,
    quality: 0.7,
    attempts: 3,
    withinBudget: true,
}));

vi.mock("./transform", () => ({
    resizeImage: (...args: unknown[]) => resizeMock(...(args as [])),
}));
vi.mock("./compress", () => ({
    compressToTarget: (...args: unknown[]) => compressMock(...(args as [])),
}));

const { useImagePreview, useImageProcessing } = await import("./use-image-processing");

const createUrl = vi.fn(() => "blob:fake");
const revokeUrl = vi.fn();

beforeEach(() => {
    resizeMock.mockClear();
    compressMock.mockClear();
    createUrl.mockClear();
    revokeUrl.mockClear();
    vi.stubGlobal("URL", { ...URL, createObjectURL: createUrl, revokeObjectURL: revokeUrl });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const blob = new Blob([new Uint8Array(4)], { type: "image/jpeg" });

describe("imaging · useImagePreview", () => {
    it("creates an object URL for a blob", () => {
        const { result } = renderHook(() => useImagePreview(blob));
        expect(result.current.url).toBe("blob:fake");
        expect(createUrl).toHaveBeenCalledWith(blob);
    });

    it("revokes the URL on unmount, so the blob can be freed", () => {
        const { unmount } = renderHook(() => useImagePreview(blob));
        unmount();
        expect(revokeUrl).toHaveBeenCalledWith("blob:fake");
    });

    it("revokes the old URL when the source changes", () => {
        const { rerender } = renderHook(({ source }) => useImagePreview(source), {
            initialProps: { source: blob },
        });
        rerender({ source: new Blob([new Uint8Array(8)], { type: "image/png" }) });
        expect(revokeUrl).toHaveBeenCalledTimes(1);
        expect(createUrl).toHaveBeenCalledTimes(2);
    });

    it("holds no URL for a null source", () => {
        const { result } = renderHook(() => useImagePreview(null));
        expect(result.current.url).toBeNull();
        expect(createUrl).not.toHaveBeenCalled();
    });
});

describe("imaging · useImageProcessing", () => {
    it("starts idle", () => {
        const { result } = renderHook(() => useImageProcessing());
        expect(result.current.status).toBe("idle");
        expect(result.current.result).toBeNull();
        expect(result.current.isWorking).toBe(false);
    });

    it("resizes and reports the result", async () => {
        const { result } = renderHook(() => useImageProcessing());
        const produced = await act(async () => await result.current.resize(blob, { width: 100 }));

        expect(produced.width).toBe(100);
        await waitFor(() => expect(result.current.status).toBe("done"));
        expect(result.current.result?.bytes).toBe(10);
    });

    it("compresses and reports the result", async () => {
        const { result } = renderHook(() => useImageProcessing());
        const produced = await act(
            async () => await result.current.compress(blob, { maxBytes: 1000 }),
        );

        expect(produced.withinBudget).toBe(true);
        await waitFor(() => expect(result.current.status).toBe("done"));
    });

    it("surfaces a failure and still rejects, so a caller can catch it", async () => {
        resizeMock.mockRejectedValueOnce(new Error("decode failed"));
        const { result } = renderHook(() => useImageProcessing());

        let caught: Error | null = null;
        await act(async () => {
            await result.current.resize(blob).catch((error: Error) => {
                caught = error;
            });
        });

        expect((caught as Error | null)?.message).toMatch(/decode failed/);
        await waitFor(() => expect(result.current.status).toBe("error"));
        expect(result.current.error?.message).toMatch(/decode failed/);
    });

    it("does not warn about a state update after unmount", async () => {
        /**
         * The failure this guards against is a resize that finishes after the
         * user navigated away. React reports it on the console rather than
         * throwing, so the console is what the test watches.
         */
        let release: ((value: unknown) => void) | undefined;
        resizeMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    release = resolve;
                }) as never,
        );
        const warnings = vi.spyOn(console, "error").mockImplementation(() => undefined);

        const { result, unmount } = renderHook(() => useImageProcessing());
        const pending = result.current.resize(blob);
        unmount();
        release?.({ blob, width: 1, height: 1, type: "image/jpeg", bytes: 1 });
        await pending;

        const messages = warnings.mock.calls.map((call) => String(call[0]));
        warnings.mockRestore();
        expect(messages.some((message) => /unmounted/i.test(message))).toBe(false);
    });
});

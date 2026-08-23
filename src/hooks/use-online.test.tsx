import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOnline } from "./use-online";

function setNavOnline(value: boolean): void {
    Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

afterEach(() => {
    setNavOnline(true);
    vi.restoreAllMocks();
});

describe("useOnline", () => {
    it("reflects navigator.onLine", () => {
        const { result } = renderHook(() => useOnline());
        expect(typeof result.current).toBe("boolean");
    });

    it("updates on online/offline events", () => {
        const { result } = renderHook(() => useOnline());
        act(() => {
            window.dispatchEvent(new Event("offline"));
        });
        expect(result.current).toBe(false);
        act(() => {
            window.dispatchEvent(new Event("online"));
        });
        expect(result.current).toBe(true);
    });

    it("stays online when the reachability probe succeeds", async () => {
        setNavOnline(true);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
        const { result } = renderHook(() => useOnline({ pingUrl: "/health" }));
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
        expect(result.current).toBe(true);
    });

    it("downgrades to offline when the probe fails despite navigator.onLine", async () => {
        setNavOnline(true);
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("captive portal")));
        const { result } = renderHook(() => useOnline({ pingUrl: "/health" }));
        await waitFor(() => expect(result.current).toBe(false));
    });

    it("skips the probe and reports offline when navigator.onLine is false", async () => {
        setNavOnline(false);
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const { result } = renderHook(() => useOnline({ pingUrl: "/health" }));
        await waitFor(() => expect(result.current).toBe(false));
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("re-probes on the interval and whenever the tab wakes", async () => {
        vi.useFakeTimers();
        setNavOnline(true);
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        renderHook(() => useOnline({ pingUrl: "/health", intervalMs: 1000 }));
        await vi.advanceTimersByTimeAsync(0);
        const afterMount = fetchMock.mock.calls.length;

        await vi.advanceTimersByTimeAsync(1000);
        expect(fetchMock.mock.calls.length).toBeGreaterThan(afterMount);

        const afterInterval = fetchMock.mock.calls.length;
        await act(async () => {
            document.dispatchEvent(new Event("visibilitychange"));
        });
        expect(fetchMock.mock.calls.length).toBeGreaterThan(afterInterval);

        vi.useRealTimers();
    });

    it("treats a probe that never answers as unreachable", async () => {
        vi.useFakeTimers();
        setNavOnline(true);
        vi.stubGlobal(
            "fetch",
            vi.fn(
                (_url: string, init: RequestInit) =>
                    new Promise((_resolve, reject) => {
                        init.signal?.addEventListener("abort", () =>
                            reject(new DOMException("Aborted", "AbortError")),
                        );
                    }),
            ),
        );

        const { result } = renderHook(() => useOnline({ pingUrl: "/health", timeoutMs: 500 }));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(600);
        });

        expect(result.current).toBe(false);
        vi.useRealTimers();
    });
});

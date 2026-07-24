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
});

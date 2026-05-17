import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWebSocket } from "./use-web-socket";

class WSMock {
    static OPEN = 1;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    readyState = 0;
    sent: unknown[] = [];
    constructor(public url: string) {}
    send = vi.fn();
    close = vi.fn();
}

describe("useWebSocket", () => {
    it("returns idle when disabled", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const { result } = renderHook(() => useWebSocket("ws://x", { enabled: false }));
        expect(result.current.status).toBe("idle");
        vi.unstubAllGlobals();
    });

    it("send returns false when socket not open", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const { result } = renderHook(() => useWebSocket("ws://x"));
        expect(result.current.send("hi")).toBe(false);
        vi.unstubAllGlobals();
    });
});

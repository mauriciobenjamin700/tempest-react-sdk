import { describe, expect, it, vi } from "vitest";
import { createWebSocket } from "./create-web-socket";

class WSMock {
    static OPEN = 1;
    static last: WSMock | null = null;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    readyState = 0;
    send = vi.fn();
    close = vi.fn();
    constructor(public url: string) {
        WSMock.last = this;
    }
}

describe("createWebSocket — parser + clean close", () => {
    it("does not reconnect on clean close", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("WebSocket", WSMock);
        const onStatusChange = vi.fn();
        const controller = createWebSocket("ws://x", {
            initialBackoff: 10,
            maxRetries: 5,
            onStatusChange,
        });
        const first = WSMock.last!;
        first.onclose?.({ wasClean: true } as CloseEvent);
        vi.advanceTimersByTime(50);
        // status went to "closed" but no reconnect attempted
        expect(WSMock.last).toBe(first);
        controller.close();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("uses custom parser", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const onMessage = vi.fn();
        const controller = createWebSocket("ws://x", {
            parser: (raw) => `parsed:${raw}`,
            onMessage,
        });
        WSMock.last?.onmessage?.({ data: "hello" } as MessageEvent);
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ data: "parsed:hello" }));
        controller.close();
        vi.unstubAllGlobals();
    });

    it("returns raw string when JSON parse fails", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const onMessage = vi.fn();
        const controller = createWebSocket("ws://x", { onMessage });
        WSMock.last?.onmessage?.({ data: "{invalid" } as MessageEvent);
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ data: "{invalid" }));
        controller.close();
        vi.unstubAllGlobals();
    });
});

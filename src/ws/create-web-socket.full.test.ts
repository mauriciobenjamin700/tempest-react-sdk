import { describe, expect, it, vi } from "vitest";
import { createWebSocket } from "./create-web-socket";

const OPEN = 1;

class WSMock {
    static instances: WSMock[] = [];
    static OPEN = OPEN;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    readyState = 0;
    sent: unknown[] = [];
    closed = false;
    constructor(public url: string) {
        WSMock.instances.push(this);
    }
    send = vi.fn((payload: unknown) => {
        this.sent.push(payload);
    });
    close = vi.fn(() => {
        this.closed = true;
        this.readyState = 3;
        this.onclose?.({ wasClean: true } as CloseEvent);
    });
}

describe("createWebSocket — full", () => {
    it("send() returns true when socket is open", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const controller = createWebSocket("ws://x");
        const instance = WSMock.instances.at(-1)!;
        instance.readyState = OPEN;
        expect(controller.send("hi")).toBe(true);
        expect(instance.sent).toEqual(["hi"]);
        controller.close();
        vi.unstubAllGlobals();
    });

    it("schedules reconnect on non-clean close", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("WebSocket", WSMock);
        WSMock.instances.length = 0;
        const controller = createWebSocket("ws://x", {
            initialBackoff: 10,
            maxRetries: 2,
        });
        const first = WSMock.instances.at(-1)!;
        first.onclose?.({ wasClean: false } as CloseEvent);
        vi.advanceTimersByTime(20);
        await Promise.resolve();
        expect(WSMock.instances.length).toBeGreaterThan(1);
        controller.close();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("ping interval sends pings while open", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("WebSocket", WSMock);
        WSMock.instances.length = 0;
        const controller = createWebSocket("ws://x", { pingInterval: 100 });
        const instance = WSMock.instances.at(-1)!;
        instance.readyState = OPEN;
        instance.onopen?.(new Event("open"));
        vi.advanceTimersByTime(250);
        expect(instance.send).toHaveBeenCalled();
        controller.close();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });
});

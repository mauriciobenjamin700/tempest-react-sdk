import { describe, expect, it, vi } from "vitest";
import { createWebSocket } from "./create-web-socket";

const OPEN = 1;

class WSMock {
    static instances: WSMock[] = [];
    static CONNECTING = 0;
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
    send(payload: unknown): void {
        this.sent.push(payload);
    }
    close(): void {
        this.closed = true;
        this.readyState = 3;
        this.onclose?.({ wasClean: true } as CloseEvent);
    }
}

describe("createWebSocket", () => {
    it("opens a socket and forwards parsed messages", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const onMessage = vi.fn();
        const controller = createWebSocket("ws://x", { onMessage });
        const instance = WSMock.instances.at(-1)!;
        instance.readyState = OPEN;
        instance.onopen?.(new Event("open"));
        instance.onmessage?.({ data: JSON.stringify({ hi: 1 }) } as MessageEvent);
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ data: { hi: 1 } }));
        controller.close();
        expect(instance.closed).toBe(true);
        vi.unstubAllGlobals();
    });

    it("send() returns false when socket is not open", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const controller = createWebSocket("ws://x");
        expect(controller.send("noop")).toBe(false);
        controller.close();
        vi.unstubAllGlobals();
    });
});

describe("createWebSocket heartbeat and outbox", () => {
    it("answers a server ping with a pong", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const onMessage = vi.fn();
        const controller = createWebSocket("ws://x", { onMessage });
        const instance = WSMock.instances.at(-1)!;
        instance.readyState = OPEN;
        instance.onopen?.(new Event("open"));
        instance.onmessage?.({ data: JSON.stringify({ type: "ping" }) } as MessageEvent);
        expect(instance.sent).toEqual([JSON.stringify({ type: "pong" })]);
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ data: { type: "ping" } }));
        controller.close();
        vi.unstubAllGlobals();
    });

    it("stays silent on ping when respondToPing is off", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const controller = createWebSocket("ws://x", { respondToPing: false });
        const instance = WSMock.instances.at(-1)!;
        instance.readyState = OPEN;
        instance.onopen?.(new Event("open"));
        instance.onmessage?.({ data: JSON.stringify({ type: "ping" }) } as MessageEvent);
        expect(instance.sent).toEqual([]);
        controller.close();
        vi.unstubAllGlobals();
    });

    it("queues while closed and flushes in order on open", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const controller = createWebSocket("ws://x", { queueWhileClosed: true });
        const instance = WSMock.instances.at(-1)!;
        expect(controller.send("first")).toBe(true);
        expect(controller.send("second")).toBe(true);
        expect(instance.sent).toEqual([]);
        instance.readyState = OPEN;
        instance.onopen?.(new Event("open"));
        expect(instance.sent).toEqual(["first", "second"]);
        controller.close();
        vi.unstubAllGlobals();
    });

    it("drops the oldest payload past maxQueuedMessages", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const controller = createWebSocket("ws://x", {
            queueWhileClosed: true,
            maxQueuedMessages: 2,
        });
        const instance = WSMock.instances.at(-1)!;
        controller.send("a");
        controller.send("b");
        controller.send("c");
        instance.readyState = OPEN;
        instance.onopen?.(new Event("open"));
        expect(instance.sent).toEqual(["b", "c"]);
        controller.close();
        vi.unstubAllGlobals();
    });

    it("defers a close issued while still connecting", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const controller = createWebSocket("ws://x");
        const instance = WSMock.instances.at(-1)!;
        instance.readyState = 0; // CONNECTING
        controller.close();
        expect(instance.closed).toBe(false);
        instance.readyState = OPEN;
        instance.onopen?.(new Event("open"));
        expect(instance.closed).toBe(true);
        vi.unstubAllGlobals();
    });
});

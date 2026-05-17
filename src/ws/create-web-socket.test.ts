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

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

describe("createWebSocket — retries, ping and manual control", () => {
    function install(): void {
        WSMock.instances = [];
        vi.stubGlobal("WebSocket", WSMock as unknown as typeof WebSocket);
    }

    it("stops retrying and reports error after maxRetries", async () => {
        vi.useFakeTimers();
        install();
        const onStatusChange = vi.fn();
        createWebSocket("wss://x", { maxRetries: 2, initialBackoff: 10, onStatusChange });

        for (let attempt = 0; attempt < 3; attempt += 1) {
            const socket = WSMock.instances[WSMock.instances.length - 1];
            socket.onclose?.({ wasClean: false } as CloseEvent);
            await vi.advanceTimersByTimeAsync(1000);
        }

        expect(onStatusChange).toHaveBeenCalledWith("error");
        expect(WSMock.instances.length).toBe(3);
        vi.useRealTimers();
    });

    it("caps the backoff at maxBackoff", async () => {
        vi.useFakeTimers();
        install();
        createWebSocket("wss://x", { maxRetries: 5, initialBackoff: 1000, maxBackoff: 1500 });

        WSMock.instances[0].onclose?.({ wasClean: false } as CloseEvent);
        await vi.advanceTimersByTimeAsync(1000);
        expect(WSMock.instances.length).toBe(2);

        WSMock.instances[1].onclose?.({ wasClean: false } as CloseEvent);
        await vi.advanceTimersByTimeAsync(1500);
        expect(WSMock.instances.length).toBe(3);
        vi.useRealTimers();
    });

    it("skips a ping while the socket is not open", async () => {
        vi.useFakeTimers();
        install();
        createWebSocket("wss://x", { pingInterval: 50 });
        const socket = WSMock.instances[0];
        socket.readyState = OPEN;
        socket.onopen?.(new Event("open"));

        socket.readyState = 0;
        await vi.advanceTimersByTimeAsync(120);
        expect(socket.send).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it("ignores a non-positive pingInterval", async () => {
        vi.useFakeTimers();
        install();
        createWebSocket("wss://x", { pingInterval: 0 });
        const socket = WSMock.instances[0];
        socket.readyState = OPEN;
        socket.onopen?.(new Event("open"));
        await vi.advanceTimersByTimeAsync(500);
        expect(socket.send).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it("reconnect() resets the retry counter and opens a fresh socket", () => {
        install();
        const controller = createWebSocket("wss://x", { maxRetries: 1 });
        controller.reconnect();
        expect(WSMock.instances.length).toBe(2);
        expect(controller.status).toBe("connecting");
    });

    it("reconnect() after close() revives the client", () => {
        install();
        const controller = createWebSocket("wss://x");
        controller.close();
        expect(controller.status).toBe("closed");
        controller.reconnect();
        expect(controller.status).toBe("connecting");
    });

    it("close() is safe with no live socket and clears a pending retry", async () => {
        vi.useFakeTimers();
        install();
        const controller = createWebSocket("wss://x", { initialBackoff: 50 });
        WSMock.instances[0].onclose?.({ wasClean: false } as CloseEvent);
        controller.close();
        await vi.advanceTimersByTimeAsync(200);
        expect(WSMock.instances.length).toBe(1);
        expect(controller.status).toBe("closed");
        vi.useRealTimers();
    });

    it("forwards errors and treats non-string frames as empty", () => {
        install();
        const onError = vi.fn();
        const onMessage = vi.fn();
        createWebSocket("wss://x", { onError, onMessage });
        const socket = WSMock.instances[0];

        socket.onerror?.(new Event("error"));
        expect(onError).toHaveBeenCalled();

        socket.onmessage?.({ data: new ArrayBuffer(2) } as MessageEvent);
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ data: "" }));
    });

    it("does not emit the same status twice in a row", () => {
        install();
        const onStatusChange = vi.fn();
        const controller = createWebSocket("wss://x", { onStatusChange });
        controller.close();
        controller.close();
        const closedEmissions = onStatusChange.mock.calls.filter(([s]) => s === "closed").length;
        expect(closedEmissions).toBe(1);
    });
});

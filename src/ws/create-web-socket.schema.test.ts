import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createWebSocket } from "./create-web-socket";

class WSMock {
    static CONNECTING = 0;
    static OPEN = 1;
    static last: WSMock | null = null;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    readyState = 1;
    send = vi.fn();
    close = vi.fn();
    constructor(public url: string) {
        WSMock.last = this;
    }
}

interface Frame {
    kind: string;
    body: string;
}

const frameSchema = z.object({ kind: z.string(), body: z.string() });

describe("createWebSocket — schema", () => {
    it("delivers a frame that matches", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const onMessage = vi.fn();
        const controller = createWebSocket<Frame>("ws://x", {
            schema: frameSchema,
            onMessage,
        });

        WSMock.last?.onmessage?.({
            data: JSON.stringify({ kind: "chat", body: "oi" }),
        } as MessageEvent);

        expect(onMessage).toHaveBeenCalledWith(
            expect.objectContaining({ data: { kind: "chat", body: "oi" } }),
        );
        controller.close();
        vi.unstubAllGlobals();
    });

    it("drops a frame the schema refuses and reports the issues", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const onMessage = vi.fn();
        const onValidationError = vi.fn();
        const controller = createWebSocket<Frame>("ws://x", {
            schema: frameSchema,
            onValidationError,
            onMessage,
        });

        WSMock.last?.onmessage?.({ data: JSON.stringify({ kind: "chat" }) } as MessageEvent);

        expect(onMessage).not.toHaveBeenCalled();
        const issues = onValidationError.mock.calls[0]?.[0] as { path: string }[];
        expect(issues[0]?.path).toBe("body");
        controller.close();
        vi.unstubAllGlobals();
    });

    it("still answers a server ping the schema refuses, or the server closes with 4408", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const onMessage = vi.fn();
        const controller = createWebSocket<Frame>("ws://x", {
            schema: frameSchema,
            onMessage,
        });
        const socket = WSMock.last!;

        socket.onmessage?.({ data: JSON.stringify({ type: "ping" }) } as MessageEvent);

        expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "pong" }));
        expect(onMessage).not.toHaveBeenCalled();
        controller.close();
        vi.unstubAllGlobals();
    });

    it("does not answer a frame that only mentions ping in its body", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const controller = createWebSocket<Frame>("ws://x", { schema: frameSchema });
        const socket = WSMock.last!;

        socket.onmessage?.({
            data: JSON.stringify({ kind: "chat", body: '"ping"', type: "chat" }),
        } as MessageEvent);
        socket.onmessage?.({ data: '{"type":"ping"' } as MessageEvent);

        expect(socket.send).not.toHaveBeenCalled();
        controller.close();
        vi.unstubAllGlobals();
    });

    it("leaves the ping reply alone when respondToPing is off", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const controller = createWebSocket<Frame>("ws://x", {
            schema: frameSchema,
            respondToPing: false,
        });
        const socket = WSMock.last!;

        socket.onmessage?.({ data: JSON.stringify({ type: "ping" }) } as MessageEvent);

        expect(socket.send).not.toHaveBeenCalled();
        controller.close();
        vi.unstubAllGlobals();
    });
});

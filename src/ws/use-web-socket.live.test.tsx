/**
 * The hook's live path: the wiring it hands `createWebSocket`.
 *
 * `use-web-socket.test.tsx` covers the two answers the hook gives before a
 * socket exists. Everything the hook actually *does* — parsing a frame,
 * forwarding the four callbacks through the latest-options ref, publishing
 * `lastMessage`, sending and reconnecting through the controller — only runs
 * once a socket opens, which is what this file drives.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWebSocket } from "./use-web-socket";

const OPEN = 1;

/** The `WebSocket` double, kept reachable so a test can drive its handlers. */
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
    constructor(public url: string) {
        WSMock.instances.push(this);
    }
    send = vi.fn((payload: unknown) => {
        this.sent.push(payload);
    });
    close = vi.fn(() => {
        this.readyState = 3;
    });
}

/** The socket the hook opened last. */
function socket(): WSMock {
    return WSMock.instances[WSMock.instances.length - 1];
}

/** Open the current socket, as the browser would. */
function open(): void {
    act(() => {
        socket().readyState = OPEN;
        socket().onopen?.(new Event("open"));
    });
}

/** Deliver one frame to the current socket. */
function deliver(data: unknown): void {
    act(() => {
        socket().onmessage?.({ data } as MessageEvent);
    });
}

beforeEach(() => {
    WSMock.instances = [];
    vi.stubGlobal("WebSocket", WSMock as unknown as typeof WebSocket);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("useWebSocket — a socket that opens", () => {
    it("publishes the parsed frame and forwards it to the caller", () => {
        const onMessage = vi.fn();
        const { result } = renderHook(() =>
            useWebSocket<{ tipo: string }>("ws://x", { onMessage }),
        );
        open();

        deliver(JSON.stringify({ tipo: "pedido" }));

        expect(result.current.status).toBe("open");
        expect(result.current.lastMessage?.data).toEqual({ tipo: "pedido" });
        expect(onMessage).toHaveBeenCalledWith(
            expect.objectContaining({ data: { tipo: "pedido" } }),
        );
    });

    it("hands back the raw text when the frame is not JSON", () => {
        const { result } = renderHook(() => useWebSocket<string>("ws://x"));
        open();

        deliver("pong");

        expect(result.current.lastMessage?.data).toBe("pong");
    });

    it("lets a caller's parser win over the JSON default", () => {
        const { result } = renderHook(() =>
            useWebSocket<number>("ws://x", { parser: (raw) => raw.length }),
        );
        open();

        deliver("quatro");

        expect(result.current.lastMessage?.data).toBe(6);
    });

    it("forwards open, error and close to the caller", () => {
        const onOpen = vi.fn();
        const onError = vi.fn();
        const onClose = vi.fn();
        renderHook(() => useWebSocket("ws://x", { onOpen, onError, onClose, maxRetries: 0 }));

        open();
        act(() => socket().onerror?.(new Event("error")));
        act(() => socket().onclose?.({ wasClean: true } as CloseEvent));

        expect(onOpen).toHaveBeenCalled();
        expect(onError).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it("sends through the live socket and reconnects on demand", () => {
        const { result } = renderHook(() => useWebSocket("ws://x"));
        open();

        expect(result.current.send("oi")).toBe(true);
        expect(socket().sent).toEqual(["oi"]);

        const before = WSMock.instances.length;
        act(() => result.current.reconnect());

        expect(WSMock.instances.length).toBe(before + 1);
    });

    it("closes the socket when the component goes away", () => {
        const { unmount } = renderHook(() => useWebSocket("ws://x"));
        open();
        const live = socket();

        unmount();

        expect(live.close).toHaveBeenCalled();
    });
});

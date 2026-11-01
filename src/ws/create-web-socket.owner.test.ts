import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebSocket } from "./create-web-socket";
import { useWebSocket } from "./use-web-socket";

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
    constructor(public url: string) {
        WSMock.instances.push(this);
    }
    send(payload: unknown): void {
        this.sent.push(payload);
    }
    close(): void {
        this.readyState = 3;
        this.onclose?.({ wasClean: true, code: 1000 } as CloseEvent);
    }
}

function open(instance: WSMock): void {
    instance.readyState = OPEN;
    instance.onopen?.(new Event("open"));
}

afterEach(() => {
    vi.unstubAllGlobals();
    WSMock.instances.length = 0;
});

describe("createWebSocket — queued frames bound to their owner", () => {
    it("does not replay the previous user's queued frames on a reconnect under the next user", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const principal = { current: "user-a" as string | null };
        const controller = createWebSocket("ws://x", {
            queueWhileClosed: true,
            getPrincipal: () => principal.current,
        });
        const socket = WSMock.instances.at(-1)!;

        controller.send("A's message");
        principal.current = "user-b";
        controller.send("B's message");
        open(socket);

        expect(socket.sent).toEqual(["B's message"]);
        controller.close();
    });

    it("replays the queued frames when the same user is still signed in", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const controller = createWebSocket("ws://x", {
            queueWhileClosed: true,
            getPrincipal: () => 42,
        });
        const socket = WSMock.instances.at(-1)!;

        controller.send("first");
        controller.send("second");
        open(socket);

        expect(socket.sent).toEqual(["first", "second"]);
        controller.close();
    });

    it("drops frames queued by a user who signed out before the reconnect", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const principal = { current: "user-a" as string | null };
        const controller = createWebSocket("ws://x", {
            queueWhileClosed: true,
            getPrincipal: () => principal.current,
        });
        const socket = WSMock.instances.at(-1)!;

        controller.send("A's message");
        principal.current = null;
        open(socket);

        expect(socket.sent).toEqual([]);
        controller.close();
    });

    it("reads a getter that throws as nobody", () => {
        vi.stubGlobal("WebSocket", WSMock);
        let throwing = false;
        const controller = createWebSocket("ws://x", {
            queueWhileClosed: true,
            getPrincipal: () => {
                if (throwing) throw new Error("store gone");
                return "user-a";
            },
        });
        const socket = WSMock.instances.at(-1)!;

        controller.send("A's message");
        throwing = true;
        open(socket);

        expect(socket.sent).toEqual([]);
        controller.close();
    });

    it("useWebSocket forwards getPrincipal and reads the latest one", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const { result, rerender, unmount } = renderHook(
            ({ user }: { user: string }) =>
                useWebSocket("ws://x", { queueWhileClosed: true, getPrincipal: () => user }),
            { initialProps: { user: "user-a" } },
        );
        const socket = WSMock.instances.at(-1)!;

        result.current.send("A's message");
        rerender({ user: "user-b" });
        act(() => open(socket));

        expect(socket.sent).toEqual([]);
        unmount();
    });
});

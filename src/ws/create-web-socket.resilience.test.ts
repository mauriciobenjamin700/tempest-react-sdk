import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebSocket } from "./create-web-socket";

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

/** A `WebSocket` that never resolves on its own, so tests drive every transition. */
class WSMock {
    static instances: WSMock[] = [];
    static CONNECTING = CONNECTING;
    static OPEN = OPEN;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    readyState = CONNECTING;
    sent: unknown[] = [];
    constructor(public url: string) {
        WSMock.instances.push(this);
    }
    send = vi.fn((payload: unknown) => {
        this.sent.push(payload);
    });
    close = vi.fn(() => {
        this.readyState = CLOSED;
        this.onclose?.({ code: 1000, wasClean: true } as CloseEvent);
    });
    /** Bring the socket up the way a real server would. */
    accept(): void {
        this.readyState = OPEN;
        this.onopen?.(new Event("open"));
    }
    /** Deliver a frame. */
    deliver(payload: unknown): void {
        this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
    }
    /** Drop the connection with a close code. */
    drop(code: number, wasClean = false): void {
        this.readyState = CLOSED;
        this.onclose?.({ code, wasClean } as CloseEvent);
    }
}

function install(): void {
    WSMock.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", WSMock as unknown as typeof WebSocket);
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("createWebSocket — handshake timeout", () => {
    it("retries a handshake that hangs in CONNECTING without firing any event", async () => {
        install();
        createWebSocket("wss://x", { handshakeTimeout: 8000, initialBackoff: 10, jitter: 0 });
        expect(WSMock.instances).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(7999);
        expect(WSMock.instances).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(1);
        await vi.advanceTimersByTimeAsync(10);
        expect(WSMock.instances).toHaveLength(2);
    });

    it("leaves a socket that opened in time alone", async () => {
        install();
        createWebSocket("wss://x", { handshakeTimeout: 100 });
        WSMock.instances[0].accept();

        await vi.advanceTimersByTimeAsync(500);
        expect(WSMock.instances).toHaveLength(1);
        expect(WSMock.instances[0].close).not.toHaveBeenCalled();
    });

    it("drops the deadline of a socket that reconnect() replaced", async () => {
        const onReconnecting = vi.fn();
        install();
        const controller = createWebSocket("wss://x", {
            handshakeTimeout: 8000,
            initialBackoff: 10,
            jitter: 0,
            onReconnecting,
        });

        await vi.advanceTimersByTimeAsync(5000);
        controller.reconnect();
        expect(WSMock.instances).toHaveLength(2);

        await vi.advanceTimersByTimeAsync(3050);

        expect(WSMock.instances).toHaveLength(2);
        expect(onReconnecting).not.toHaveBeenCalled();
    });

    it("keeps its own deadline after replacing a hung socket", async () => {
        install();
        const controller = createWebSocket("wss://x", {
            handshakeTimeout: 8000,
            initialBackoff: 10,
            jitter: 0,
        });

        await vi.advanceTimersByTimeAsync(5000);
        controller.reconnect();

        await vi.advanceTimersByTimeAsync(7999);
        expect(WSMock.instances).toHaveLength(2);

        await vi.advanceTimersByTimeAsync(1);
        await vi.advanceTimersByTimeAsync(10);
        expect(WSMock.instances).toHaveLength(3);
    });

    it("can be disabled with 0", async () => {
        install();
        createWebSocket("wss://x", { handshakeTimeout: 0 });
        await vi.advanceTimersByTimeAsync(60_000);
        expect(WSMock.instances).toHaveLength(1);
    });
});

describe("createWebSocket — silence watchdog", () => {
    it("reconnects an open socket that stops sending anything", async () => {
        install();
        createWebSocket("wss://x", { silenceTimeout: 7500, initialBackoff: 10, jitter: 0 });
        WSMock.instances[0].accept();

        await vi.advanceTimersByTimeAsync(7499);
        expect(WSMock.instances).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(1);
        await vi.advanceTimersByTimeAsync(10);
        expect(WSMock.instances).toHaveLength(2);
    });

    it("is re-armed by any inbound frame, not only by pings", async () => {
        install();
        const onMessage = vi.fn();
        createWebSocket("wss://x", { silenceTimeout: 1000, onMessage, jitter: 0 });
        const socket = WSMock.instances[0];
        socket.accept();

        for (let tick = 0; tick < 5; tick += 1) {
            await vi.advanceTimersByTimeAsync(900);
            socket.deliver({ type: "offer" });
        }

        expect(WSMock.instances).toHaveLength(1);
        expect(onMessage).toHaveBeenCalledTimes(5);
    });

    it("counts one failure, not two, when the watchdog fires", async () => {
        install();
        const onReconnecting = vi.fn();
        createWebSocket("wss://x", {
            silenceTimeout: 100,
            initialBackoff: 10,
            jitter: 0,
            onReconnecting,
        });
        WSMock.instances[0].accept();

        await vi.advanceTimersByTimeAsync(100);
        expect(onReconnecting).toHaveBeenCalledTimes(1);
        expect(onReconnecting).toHaveBeenCalledWith(1, 10);
    });

    it("takes a new window at runtime, for a server that announces its heartbeat", async () => {
        install();
        const controller = createWebSocket("wss://x", { initialBackoff: 10, jitter: 0 });
        WSMock.instances[0].accept();

        await vi.advanceTimersByTimeAsync(60_000);
        expect(WSMock.instances).toHaveLength(1);

        controller.setSilenceTimeout(2500);
        await vi.advanceTimersByTimeAsync(2500);
        await vi.advanceTimersByTimeAsync(10);
        expect(WSMock.instances).toHaveLength(2);
    });

    it("disarms on a non-positive or non-finite window", async () => {
        install();
        const controller = createWebSocket("wss://x", { silenceTimeout: 100, jitter: 0 });
        WSMock.instances[0].accept();

        controller.setSilenceTimeout(Number.NaN);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(WSMock.instances).toHaveLength(1);
    });

    it("clears the window while the socket is not open", async () => {
        install();
        const controller = createWebSocket("wss://x", { handshakeTimeout: 0, jitter: 0 });
        controller.setSilenceTimeout(50);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(WSMock.instances).toHaveLength(1);
    });
});

describe("createWebSocket — close-code classification", () => {
    it("stops for good on a refusal and says which dead end it is", async () => {
        install();
        const onLost = vi.fn();
        const onStatusChange = vi.fn();
        createWebSocket("wss://x", { initialBackoff: 10, jitter: 0, onLost, onStatusChange });
        WSMock.instances[0].accept();
        WSMock.instances[0].drop(4401, true);

        await vi.advanceTimersByTimeAsync(1000);
        expect(onLost).toHaveBeenCalledWith("rejected");
        expect(onStatusChange).toHaveBeenCalledWith("error");
        expect(WSMock.instances).toHaveLength(1);
    });

    it("retries the heartbeat timeout, which shares the refusal range", async () => {
        install();
        const onLost = vi.fn();
        createWebSocket("wss://x", { initialBackoff: 10, jitter: 0, onLost });
        WSMock.instances[0].accept();
        WSMock.instances[0].drop(4408, true);

        await vi.advanceTimersByTimeAsync(10);
        expect(onLost).not.toHaveBeenCalled();
        expect(WSMock.instances).toHaveLength(2);
    });

    it("retries a clean close that means the server is restarting", async () => {
        install();
        createWebSocket("wss://x", { initialBackoff: 10, jitter: 0 });
        WSMock.instances[0].accept();
        WSMock.instances[0].drop(1012, true);

        await vi.advanceTimersByTimeAsync(10);
        expect(WSMock.instances).toHaveLength(2);
    });

    it("takes a clean 1000 on an open socket as a goodbye and stays quiet", async () => {
        install();
        const onLost = vi.fn();
        createWebSocket("wss://x", { initialBackoff: 10, jitter: 0, onLost });
        WSMock.instances[0].accept();
        WSMock.instances[0].drop(1000, true);

        await vi.advanceTimersByTimeAsync(1000);
        expect(onLost).not.toHaveBeenCalled();
        expect(WSMock.instances).toHaveLength(1);
    });

    it("reports a goodbye on a socket that never opened, which is a refusal", async () => {
        install();
        const onLost = vi.fn();
        createWebSocket("wss://x", { initialBackoff: 10, jitter: 0, onLost });
        WSMock.instances[0].drop(1000, true);

        await vi.advanceTimersByTimeAsync(1000);
        expect(onLost).toHaveBeenCalledWith("rejected");
    });
});

describe("createWebSocket — reconnect callbacks", () => {
    it("announces attempts quietly and the giving up loudly", async () => {
        install();
        const onReconnecting = vi.fn();
        const onLost = vi.fn();
        createWebSocket("wss://x", {
            maxRetries: 2,
            initialBackoff: 10,
            jitter: 0,
            onReconnecting,
            onLost,
        });

        for (let attempt = 0; attempt < 3; attempt += 1) {
            WSMock.instances.at(-1)!.drop(1006);
            await vi.advanceTimersByTimeAsync(50);
        }

        expect(onReconnecting.mock.calls).toEqual([
            [1, 2],
            [2, 2],
        ]);
        expect(onLost).toHaveBeenCalledWith("exhausted");
        expect(onLost).toHaveBeenCalledTimes(1);
    });

    it("fires onReconnected only after a gap, never on the first open", async () => {
        install();
        const onReconnected = vi.fn();
        createWebSocket("wss://x", { initialBackoff: 10, jitter: 0, onReconnected });
        WSMock.instances[0].accept();
        expect(onReconnected).not.toHaveBeenCalled();

        WSMock.instances[0].drop(1006);
        await vi.advanceTimersByTimeAsync(10);
        WSMock.instances[1].accept();
        expect(onReconnected).toHaveBeenCalledTimes(1);
    });
});

describe("createWebSocket — opened", () => {
    it("resolves on the first open", async () => {
        install();
        const controller = createWebSocket("wss://x", { jitter: 0 });
        WSMock.instances[0].accept();
        await expect(controller.opened).resolves.toBeUndefined();
    });

    it("rejects when the socket is lost before it ever opened", async () => {
        install();
        const controller = createWebSocket("wss://x", {
            maxRetries: 0,
            initialBackoff: 10,
            jitter: 0,
        });
        WSMock.instances[0].drop(1006);
        await vi.advanceTimersByTimeAsync(10);
        await expect(controller.opened).rejects.toThrow("websocket_exhausted");
    });

    it("rejects on a refusal, so a failed join is not hidden behind a spinner", async () => {
        install();
        const controller = createWebSocket("wss://x", { jitter: 0 });
        WSMock.instances[0].drop(4403, true);
        await expect(controller.opened).rejects.toThrow("websocket_rejected");
    });

    it("rejects when the caller closes before the socket came up", async () => {
        install();
        const controller = createWebSocket("wss://x", { jitter: 0 });
        controller.close();
        await expect(controller.opened).rejects.toThrow("websocket_closed");
    });

    it("stays resolved when a later drop exhausts the schedule", async () => {
        install();
        const controller = createWebSocket("wss://x", {
            maxRetries: 0,
            initialBackoff: 10,
            jitter: 0,
        });
        WSMock.instances[0].accept();
        WSMock.instances[0].drop(1006);
        await vi.advanceTimersByTimeAsync(10);
        await expect(controller.opened).resolves.toBeUndefined();
    });
});

describe("createWebSocket — offline", () => {
    it("suspends the schedule while the browser reports no network", async () => {
        install();
        vi.stubGlobal("navigator", { onLine: false });
        createWebSocket("wss://x", { initialBackoff: 10, jitter: 0 });
        WSMock.instances[0].drop(1006);

        await vi.advanceTimersByTimeAsync(5000);
        expect(WSMock.instances).toHaveLength(1);

        vi.stubGlobal("navigator", { onLine: true });
        window.dispatchEvent(new Event("online"));
        expect(WSMock.instances).toHaveLength(2);
    });

    it("registers a single listener across repeated schedules", async () => {
        install();
        vi.stubGlobal("navigator", { onLine: false });
        const addSpy = vi.spyOn(window, "addEventListener");
        const controller = createWebSocket("wss://x", { initialBackoff: 10, jitter: 0 });
        WSMock.instances[0].drop(1006);
        WSMock.instances[0].drop(1006);

        expect(addSpy.mock.calls.filter(([type]) => type === "online")).toHaveLength(1);
        controller.close();
        addSpy.mockRestore();
    });

    it("ignores the offline flag when waitForOnline is off", async () => {
        install();
        vi.stubGlobal("navigator", { onLine: false });
        createWebSocket("wss://x", { initialBackoff: 10, jitter: 0, waitForOnline: false });
        WSMock.instances[0].drop(1006);

        await vi.advanceTimersByTimeAsync(10);
        expect(WSMock.instances).toHaveLength(2);
    });

    it("drops the network wait when the caller closes", async () => {
        install();
        vi.stubGlobal("navigator", { onLine: false });
        const controller = createWebSocket("wss://x", { initialBackoff: 10, jitter: 0 });
        WSMock.instances[0].drop(1006);
        controller.close();

        vi.stubGlobal("navigator", { onLine: true });
        window.dispatchEvent(new Event("online"));
        expect(WSMock.instances).toHaveLength(1);
    });

    it("drops the network wait when the caller reconnects by hand", async () => {
        install();
        vi.stubGlobal("navigator", { onLine: false });
        const controller = createWebSocket("wss://x", { initialBackoff: 10, jitter: 0 });
        WSMock.instances[0].drop(1006);
        controller.reconnect();
        expect(WSMock.instances).toHaveLength(2);

        window.dispatchEvent(new Event("online"));
        expect(WSMock.instances).toHaveLength(2);
    });
});

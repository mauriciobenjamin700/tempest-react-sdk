import { describe, expect, it, vi } from "vitest";
import { createEventStream } from "./create-event-stream";

class EventSourceMock {
    static instances: EventSourceMock[] = [];
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    listeners: Record<string, (event: MessageEvent) => void> = {};
    closed = false;
    constructor(
        public url: string,
        public init?: EventSourceInit,
    ) {
        EventSourceMock.instances.push(this);
    }
    addEventListener(name: string, listener: (event: MessageEvent) => void): void {
        this.listeners[name] = listener;
    }
    close(): void {
        this.closed = true;
    }
}

describe("createEventStream", () => {
    it("opens an EventSource and emits parsed messages", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const onMessage = vi.fn();
        const controller = createEventStream("/sse", { onMessage });
        const instance = EventSourceMock.instances.at(-1)!;
        instance.onopen?.(new Event("open"));
        instance.onmessage?.({ data: JSON.stringify({ value: 1 }) } as MessageEvent);
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ data: { value: 1 } }));
        controller.close();
        expect(instance.closed).toBe(true);
        vi.unstubAllGlobals();
    });

    it("ignores heartbeat events", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const onMessage = vi.fn();
        const controller = createEventStream("/sse", {
            onMessage,
            heartbeatEvents: ["ping"],
        });
        const instance = EventSourceMock.instances.at(-1)!;
        instance.listeners["ping"]?.({ data: "" } as MessageEvent);
        expect(onMessage).not.toHaveBeenCalled();
        controller.close();
        vi.unstubAllGlobals();
    });
});

describe("createEventStream — status, ids and manual control", () => {
    function install(): void {
        EventSourceMock.instances = [];
        vi.stubGlobal("EventSource", EventSourceMock);
    }

    it("reports status transitions without repeating one", () => {
        install();
        const onStatusChange = vi.fn();
        const controller = createEventStream("/sse", { onStatusChange });
        const instance = EventSourceMock.instances.at(-1)!;

        instance.onopen?.(new Event("open"));
        expect(onStatusChange).toHaveBeenCalledWith("connecting");
        expect(onStatusChange).toHaveBeenCalledWith("open");

        controller.close();
        controller.close();
        const closes = onStatusChange.mock.calls.filter(([s]) => s === "closed").length;
        expect(closes).toBe(1);
        vi.unstubAllGlobals();
    });

    it("carries lastEventId through, and omits it when empty", () => {
        install();
        const onMessage = vi.fn();
        const controller = createEventStream("/sse", { onMessage });
        const instance = EventSourceMock.instances.at(-1)!;

        instance.onmessage?.({ data: "{}", lastEventId: "42" } as MessageEvent);
        expect(onMessage).toHaveBeenLastCalledWith(expect.objectContaining({ id: "42" }));

        instance.onmessage?.({ data: "{}", lastEventId: "" } as MessageEvent);
        expect(onMessage).toHaveBeenLastCalledWith(expect.objectContaining({ id: undefined }));

        controller.close();
        vi.unstubAllGlobals();
    });

    it("emits named events that are not heartbeats", () => {
        install();
        const onMessage = vi.fn();
        const controller = createEventStream("/sse", {
            onMessage,
            namedEvents: ["notice"],
            heartbeatEvents: ["ping"],
        });
        const instance = EventSourceMock.instances.at(-1)!;

        instance.listeners["notice"]?.({ data: '{"ok":true}' } as MessageEvent);
        expect(onMessage).toHaveBeenCalledWith(
            expect.objectContaining({ event: "notice", data: { ok: true } }),
        );

        controller.close();
        vi.unstubAllGlobals();
    });

    it("reconnect() drops a pending retry, resets the counter and reopens", async () => {
        vi.useFakeTimers();
        install();
        const controller = createEventStream("/sse", { initialBackoff: 50, maxRetries: 5 });
        EventSourceMock.instances.at(-1)!.onerror?.(new Event("error"));

        controller.reconnect();
        expect(EventSourceMock.instances.length).toBe(2);

        await vi.advanceTimersByTimeAsync(200);
        expect(EventSourceMock.instances.length).toBe(2);

        controller.close();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("reconnect() revives a closed stream", () => {
        install();
        const controller = createEventStream("/sse");
        controller.close();
        expect(controller.status).toBe("closed");

        controller.reconnect();
        expect(controller.status).toBe("connecting");
        expect(EventSourceMock.instances.length).toBe(2);

        controller.close();
        vi.unstubAllGlobals();
    });

    it("close() is safe with no live source and clears a pending retry", async () => {
        vi.useFakeTimers();
        install();
        const controller = createEventStream("/sse", { initialBackoff: 50 });
        EventSourceMock.instances.at(-1)!.onerror?.(new Event("error"));
        controller.close();

        await vi.advanceTimersByTimeAsync(300);
        expect(EventSourceMock.instances.length).toBe(1);
        expect(controller.status).toBe("closed");
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("closes the previous source when reconnecting over a live one", () => {
        install();
        const controller = createEventStream("/sse");
        const first = EventSourceMock.instances.at(-1)!;
        controller.reconnect();
        expect(first.closed).toBe(true);
        controller.close();
        vi.unstubAllGlobals();
    });
});

describe("createEventStream — handlers after close", () => {
    it("stops reconnecting once closed", async () => {
        vi.useFakeTimers();
        EventSourceMock.instances = [];
        vi.stubGlobal("EventSource", EventSourceMock);

        const controller = createEventStream("/sse", { initialBackoff: 20 });
        const instance = EventSourceMock.instances[0];
        controller.close();

        instance.onerror?.(new Event("error"));
        await vi.advanceTimersByTimeAsync(200);
        expect(EventSourceMock.instances.length).toBe(1);

        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("drops messages that arrive after close", () => {
        EventSourceMock.instances = [];
        vi.stubGlobal("EventSource", EventSourceMock);
        const onMessage = vi.fn();
        const controller = createEventStream("/sse", { onMessage });
        const instance = EventSourceMock.instances[0];

        controller.close();
        instance.onmessage?.({ data: "{}" } as MessageEvent);
        expect(onMessage).toHaveBeenCalledTimes(1);
        vi.unstubAllGlobals();
    });
});

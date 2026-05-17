import { describe, expect, it, vi } from "vitest";
import { createEventStream } from "./create-event-stream";

class EventSourceMock {
    static instances: EventSourceMock[] = [];
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    listeners: Record<string, (event: MessageEvent) => void> = {};
    closed = false;
    constructor(public url: string) {
        EventSourceMock.instances.push(this);
    }
    addEventListener(name: string, listener: (event: MessageEvent) => void): void {
        this.listeners[name] = listener;
    }
    close(): void {
        this.closed = true;
    }
}

describe("createEventStream — reconnect", () => {
    it("schedules a reconnect after an error", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("EventSource", EventSourceMock);
        const onStatusChange = vi.fn();
        const controller = createEventStream("/sse", {
            onStatusChange,
            initialBackoff: 10,
            maxRetries: 2,
        });
        const first = EventSourceMock.instances.at(-1)!;
        first.onerror?.(new Event("error"));
        vi.advanceTimersByTime(20);
        await Promise.resolve();
        expect(EventSourceMock.instances.length).toBeGreaterThan(1);
        controller.close();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("reconnect() restarts the connection", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        EventSourceMock.instances.length = 0;
        const controller = createEventStream("/sse");
        controller.close();
        controller.reconnect();
        expect(EventSourceMock.instances.length).toBeGreaterThan(1);
        controller.close();
        vi.unstubAllGlobals();
    });
});

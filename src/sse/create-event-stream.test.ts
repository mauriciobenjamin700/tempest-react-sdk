import { describe, expect, it, vi } from "vitest";
import { createEventStream } from "./create-event-stream";

class EventSourceMock {
    static instances: EventSourceMock[] = [];
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    listeners: Record<string, (event: MessageEvent) => void> = {};
    closed = false;
    constructor(public url: string, public init?: EventSourceInit) {
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
        expect(onMessage).toHaveBeenCalledWith(
            expect.objectContaining({ data: { value: 1 } }),
        );
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

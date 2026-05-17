import { describe, expect, it, vi } from "vitest";
import { createEventStream } from "./create-event-stream";

class EventSourceMock {
    static last: EventSourceMock | null = null;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    listeners: Record<string, (event: MessageEvent) => void> = {};
    close = vi.fn();
    constructor(public url: string) {
        EventSourceMock.last = this;
    }
    addEventListener(name: string, listener: (event: MessageEvent) => void): void {
        this.listeners[name] = listener;
    }
}

describe("createEventStream — heartbeat + open", () => {
    it("custom heartbeat events are silenced", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const onMessage = vi.fn();
        const controller = createEventStream("/sse", {
            heartbeatEvents: ["keep-alive"],
            onMessage,
        });
        EventSourceMock.last?.listeners["keep-alive"]?.({ data: "" } as MessageEvent);
        expect(onMessage).not.toHaveBeenCalled();
        controller.close();
        vi.unstubAllGlobals();
    });

    it("fires onOpen + transitions status to open", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const onOpen = vi.fn();
        const onStatusChange = vi.fn();
        const controller = createEventStream("/sse", { onOpen, onStatusChange });
        EventSourceMock.last?.onopen?.(new Event("open"));
        expect(onOpen).toHaveBeenCalled();
        expect(onStatusChange).toHaveBeenCalledWith("open");
        controller.close();
        vi.unstubAllGlobals();
    });

    it("status getter reflects current state", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const controller = createEventStream("/sse");
        EventSourceMock.last?.onopen?.(new Event("open"));
        expect(controller.status).toBe("open");
        controller.close();
        expect(controller.status).toBe("closed");
        vi.unstubAllGlobals();
    });
});

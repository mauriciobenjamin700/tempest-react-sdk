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

describe("createEventStream — parser + named events", () => {
    it("uses custom parser when provided", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const onMessage = vi.fn();
        const controller = createEventStream("/sse", {
            parser: (raw) => raw.toUpperCase(),
            onMessage,
        });
        EventSourceMock.last?.onmessage?.({ data: "hi" } as MessageEvent);
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ data: "HI" }));
        controller.close();
        vi.unstubAllGlobals();
    });

    it("forwards named events through onMessage", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const onMessage = vi.fn();
        const controller = createEventStream("/sse", {
            namedEvents: ["notification"],
            onMessage,
        });
        EventSourceMock.last?.listeners.notification?.({
            data: JSON.stringify({ ok: true }),
            lastEventId: "abc",
        } as MessageEvent);
        expect(onMessage).toHaveBeenCalledWith(
            expect.objectContaining({ event: "notification", id: "abc" }),
        );
        controller.close();
        vi.unstubAllGlobals();
    });

    it("returns string when JSON parsing fails (default parser fallback)", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const onMessage = vi.fn();
        const controller = createEventStream("/sse", { onMessage });
        EventSourceMock.last?.onmessage?.({ data: "not json" } as MessageEvent);
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ data: "not json" }));
        controller.close();
        vi.unstubAllGlobals();
    });
});

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

describe("createEventStream — max retries", () => {
    it("stops scheduling reconnects after maxRetries with status=error", () => {
        vi.useFakeTimers();
        vi.stubGlobal("EventSource", EventSourceMock);
        const onStatusChange = vi.fn();
        const controller = createEventStream("/sse", {
            initialBackoff: 1,
            maxBackoff: 5,
            maxRetries: 1,
            onStatusChange,
        });
        // first error → schedules retry 1
        EventSourceMock.last?.onerror?.(new Event("error"));
        vi.advanceTimersByTime(10);
        // second error after retry → exceeds maxRetries
        EventSourceMock.last?.onerror?.(new Event("error"));
        vi.advanceTimersByTime(10);
        expect(onStatusChange).toHaveBeenCalledWith("error");
        controller.close();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });
});

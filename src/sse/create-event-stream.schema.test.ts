import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
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

interface Notification {
    id: string;
    message: string;
}

const notificationSchema = z.object({ id: z.string(), message: z.string() });

describe("createEventStream — schema", () => {
    it("delivers a frame that matches the schema", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const onMessage = vi.fn();
        const controller = createEventStream<Notification>("/sse", {
            schema: notificationSchema,
            onMessage,
        });

        EventSourceMock.last?.onmessage?.({
            data: JSON.stringify({ id: "1", message: "hi" }),
        } as MessageEvent);

        expect(onMessage).toHaveBeenCalledWith(
            expect.objectContaining({ data: { id: "1", message: "hi" } }),
        );
        controller.close();
        vi.unstubAllGlobals();
    });

    it("drops the frame missing a field instead of announcing it as the message type", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const onMessage = vi.fn();
        const onValidationError = vi.fn();
        const controller = createEventStream<Notification>("/sse", {
            schema: notificationSchema,
            onValidationError,
            onMessage,
        });

        EventSourceMock.last?.onmessage?.({ data: JSON.stringify({ id: "1" }) } as MessageEvent);

        expect(onMessage).not.toHaveBeenCalled();
        expect(onValidationError).toHaveBeenCalledTimes(1);
        const issues = onValidationError.mock.calls[0]?.[0] as { path: string }[];
        expect(issues[0]?.path).toBe("message");
        controller.close();
        vi.unstubAllGlobals();
    });

    it("drops the empty heartbeat frame that reached onMessage as an empty string", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const onMessage = vi.fn();
        const onValidationError = vi.fn();
        const controller = createEventStream<Notification>("/sse", {
            namedEvents: ["notification"],
            schema: notificationSchema,
            onValidationError,
            onMessage,
        });

        EventSourceMock.last?.listeners.notification?.({ data: "" } as MessageEvent);

        expect(onMessage).not.toHaveBeenCalled();
        expect(onValidationError).toHaveBeenCalledTimes(1);
        expect(onValidationError.mock.calls[0]?.[1]).toBe("");
        controller.close();
        vi.unstubAllGlobals();
    });

    it("leaves the unvalidated path exactly as it was when no schema is given", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const onMessage = vi.fn();
        const controller = createEventStream<Notification>("/sse", { onMessage });

        EventSourceMock.last?.onmessage?.({ data: "" } as MessageEvent);

        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ data: "" }));
        controller.close();
        vi.unstubAllGlobals();
    });
});

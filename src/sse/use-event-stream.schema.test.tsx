import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useEventStream } from "./use-event-stream";

class EventSourceMock {
    static last: EventSourceMock | null = null;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    addEventListener = vi.fn();
    close = vi.fn();
    constructor(
        public url: string,
        public init?: EventSourceInit,
    ) {
        EventSourceMock.last = this;
    }
}

interface Notification {
    id: string;
    message: string;
}

const notificationSchema = z.object({ id: z.string(), message: z.string() });

describe("useEventStream — schema", () => {
    it("reaches the stream, so a refused frame never becomes lastMessage", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const onMessage = vi.fn();
        const onValidationError = vi.fn();

        const { result } = renderHook(() =>
            useEventStream<Notification>("/sse", {
                schema: notificationSchema,
                onValidationError,
                onMessage,
            }),
        );

        act(() => {
            EventSourceMock.last?.onmessage?.({
                data: JSON.stringify({ id: "1" }),
            } as MessageEvent);
        });

        expect(onMessage).not.toHaveBeenCalled();
        expect(result.current.lastMessage).toBeNull();
        expect(onValidationError).toHaveBeenCalledTimes(1);
        vi.unstubAllGlobals();
    });

    it("delivers a validated frame as lastMessage", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const { result } = renderHook(() =>
            useEventStream<Notification>("/sse", { schema: notificationSchema }),
        );

        act(() => {
            EventSourceMock.last?.onmessage?.({
                data: JSON.stringify({ id: "1", message: "oi" }),
            } as MessageEvent);
        });

        expect(result.current.lastMessage?.data).toEqual({ id: "1", message: "oi" });
        vi.unstubAllGlobals();
    });
});

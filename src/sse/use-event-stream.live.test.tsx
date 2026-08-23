/**
 * The hook's live path: what it wires into `createEventStream`.
 *
 * `use-event-stream.test.tsx` covers the two answers given before a stream
 * exists. The parts that matter — publishing `lastMessage`, forwarding the
 * caller's `onMessage` through the latest-options ref, and `reconnect()`
 * reaching the controller — only run once a frame arrives.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEventStream } from "./use-event-stream";

/** The `EventSource` double, kept reachable so a test can push frames. */
class EventSourceMock {
    static instances: EventSourceMock[] = [];
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    addEventListener = vi.fn();
    close = vi.fn();
    constructor(
        public url: string,
        public init?: EventSourceInit,
    ) {
        EventSourceMock.instances.push(this);
    }
}

/** The stream the hook opened last. */
function stream(): EventSourceMock {
    return EventSourceMock.instances[EventSourceMock.instances.length - 1];
}

beforeEach(() => {
    EventSourceMock.instances = [];
    vi.stubGlobal("EventSource", EventSourceMock as unknown as typeof EventSource);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("useEventStream — a stream that delivers", () => {
    it("publishes the frame and forwards it to the caller", () => {
        const onMessage = vi.fn();
        const { result } = renderHook(() =>
            useEventStream<{ fila: number }>("/sse", { onMessage }),
        );

        act(() => {
            stream().onopen?.(new Event("open"));
            stream().onmessage?.({ data: JSON.stringify({ fila: 3 }) } as MessageEvent);
        });

        expect(result.current.lastMessage?.data).toEqual({ fila: 3 });
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ data: { fila: 3 } }));
    });

    it("reconnects through the controller, and does nothing once unmounted", () => {
        const { result, unmount } = renderHook(() => useEventStream("/sse"));
        const opened = EventSourceMock.instances.length;

        act(() => result.current.reconnect());
        expect(EventSourceMock.instances.length).toBe(opened + 1);

        const live = stream();
        unmount();
        expect(live.close).toHaveBeenCalled();

        expect(() => result.current.reconnect()).not.toThrow();
        expect(EventSourceMock.instances.length).toBe(opened + 1);
    });
});

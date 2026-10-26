import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEventStream } from "./use-event-stream";

class EventSourceMock {
    static instances: EventSourceMock[] = [];
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    closed = false;
    constructor(public url: string) {
        EventSourceMock.instances.push(this);
    }
    addEventListener(): void {}
    close(): void {
        this.closed = true;
    }
}

describe("useEventStream — URL function", () => {
    beforeEach(() => {
        EventSourceMock.instances = [];
        vi.stubGlobal("EventSource", EventSourceMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("does not reconnect when an inline resolver is recreated on render", async () => {
        const { rerender, unmount } = renderHook(
            ({ channel }) => useEventStream(() => `/sse/${channel}`),
            {
                initialProps: { channel: "a" },
            },
        );
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));
        rerender({ channel: "a" });
        rerender({ channel: "b" });
        await Promise.resolve();
        expect(EventSourceMock.instances.map((source) => source.url)).toEqual(["/sse/a"]);
        unmount();
    });

    it("calls the latest resolver on the next connection", async () => {
        const { result, rerender, unmount } = renderHook(
            ({ channel }) => useEventStream(() => `/sse/${channel}`),
            { initialProps: { channel: "a" } },
        );
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));
        rerender({ channel: "b" });
        result.current.reconnect();
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(2));
        expect(EventSourceMock.instances[1].url).toBe("/sse/b");
        unmount();
    });

    it("still reopens when a string URL changes", () => {
        const { rerender, unmount } = renderHook(({ url }) => useEventStream(url), {
            initialProps: { url: "/sse/a" },
        });
        rerender({ url: "/sse/b" });
        expect(EventSourceMock.instances.map((source) => source.url)).toEqual(["/sse/a", "/sse/b"]);
        expect(EventSourceMock.instances[0].closed).toBe(true);
        unmount();
    });

    it("stays idle for an empty string URL", () => {
        const { result } = renderHook(() => useEventStream(""));
        expect(result.current.status).toBe("idle");
        expect(EventSourceMock.instances).toHaveLength(0);
    });
});

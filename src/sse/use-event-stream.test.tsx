import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEventStream } from "./use-event-stream";

class EventSourceMock {
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    addEventListener = vi.fn();
    close = vi.fn();
    constructor(public url: string, public init?: EventSourceInit) {}
}

describe("useEventStream", () => {
    it("returns idle when disabled", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const { result } = renderHook(() => useEventStream("/sse", { enabled: false }));
        expect(result.current.status).toBe("idle");
        vi.unstubAllGlobals();
    });

    it("returns connecting initially when enabled", () => {
        vi.stubGlobal("EventSource", EventSourceMock);
        const { result } = renderHook(() => useEventStream("/sse"));
        expect(["connecting", "open"]).toContain(result.current.status);
        vi.unstubAllGlobals();
    });
});

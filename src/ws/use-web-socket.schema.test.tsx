import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useWebSocket } from "./use-web-socket";

class WSMock {
    static CONNECTING = 0;
    static OPEN = 1;
    static last: WSMock | null = null;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    readyState = 1;
    send = vi.fn();
    close = vi.fn();
    constructor(public url: string) {
        WSMock.last = this;
    }
}

interface Frame {
    kind: string;
    body: string;
}

const frameSchema = z.object({ kind: z.string(), body: z.string() });

describe("useWebSocket — schema", () => {
    it("forwards `schema` and `onValidationError` to the socket it opens", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const onMessage = vi.fn();
        const onValidationError = vi.fn();

        const { result } = renderHook(() =>
            useWebSocket<Frame>("ws://x", {
                schema: frameSchema,
                onValidationError,
                onMessage,
            }),
        );

        act(() => {
            WSMock.last?.onmessage?.({ data: JSON.stringify({ kind: "chat" }) } as MessageEvent);
        });

        expect(onMessage).not.toHaveBeenCalled();
        expect(result.current.lastMessage).toBeNull();
        const issues = onValidationError.mock.calls[0]?.[0] as { path: string }[];
        expect(issues[0]?.path).toBe("body");
        vi.unstubAllGlobals();
    });

    it("delivers a validated frame as lastMessage", () => {
        vi.stubGlobal("WebSocket", WSMock);
        const { result } = renderHook(() => useWebSocket<Frame>("ws://x", { schema: frameSchema }));

        act(() => {
            WSMock.last?.onmessage?.({
                data: JSON.stringify({ kind: "chat", body: "oi" }),
            } as MessageEvent);
        });

        expect(result.current.lastMessage?.data).toEqual({ kind: "chat", body: "oi" });
        vi.unstubAllGlobals();
    });
});

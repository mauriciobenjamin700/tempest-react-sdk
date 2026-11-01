import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "../http/api-client";
import { createEventStream, type EventStreamMessage, type SessionKey } from "./create-event-stream";
import { createTicketEventStream, useTicketEventStream } from "./ticket-event-stream";
import { useEventStream } from "./use-event-stream";

class EventSourceMock {
    static instances: EventSourceMock[] = [];
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    closed = false;
    constructor(
        public url: string,
        public init?: EventSourceInit,
    ) {
        EventSourceMock.instances.push(this);
    }
    addEventListener(): void {}
    close(): void {
        this.closed = true;
    }
    emit(data: unknown): void {
        this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
    }
}

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

/**
 * A backend whose ticket names the user holding the session when the request
 * left, so each test can tell whose stream an `EventSource` is.
 */
function ticketBackend(session: { user: string }): typeof fetch {
    return vi.fn(async () =>
        json(200, { ticket: `ticket-of-${session.user}`, expires_in: 60 }),
    ) as unknown as typeof fetch;
}

function client(fetcher: typeof fetch) {
    return createApiClient({
        baseURL: "https://api.example.com",
        getToken: () => "access-token",
        fetcher,
    });
}

describe("session-bound streams: createEventStream", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        EventSourceMock.instances = [];
        vi.stubGlobal("EventSource", EventSourceMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("never delivers a frame of the previous session once the key changed", async () => {
        let key: SessionKey = "user-a";
        const received: unknown[] = [];
        const stream = createEventStream("https://api.example.com/sse", {
            sessionKey: () => key,
            onMessage: ({ data }) => received.push(data),
        });
        EventSourceMock.instances[0].emit({ owner: "a" });
        key = "user-b";
        EventSourceMock.instances[0].emit({ owner: "a", late: true });

        expect(received).toEqual([{ owner: "a" }]);
        stream.close();
    });

    it("closes the stream of the previous session and reopens it for the new one", async () => {
        let key: SessionKey = "user-a";
        const stream = createEventStream("https://api.example.com/sse", {
            sessionKey: () => key,
        });
        key = "user-b";
        EventSourceMock.instances[0].emit({ owner: "a" });

        expect(EventSourceMock.instances).toHaveLength(2);
        expect(EventSourceMock.instances[0].closed).toBe(true);
        expect(EventSourceMock.instances[1].closed).toBe(false);
        stream.close();
    });

    it("delivers the frames of the session the stream reopened under", async () => {
        let key: SessionKey = "user-a";
        const received: unknown[] = [];
        const stream = createEventStream("https://api.example.com/sse", {
            sessionKey: () => key,
            onMessage: ({ data }) => received.push(data),
        });
        key = "user-b";
        EventSourceMock.instances[0].emit({ owner: "a" });
        EventSourceMock.instances[1].emit({ owner: "b" });

        expect(received).toEqual([{ owner: "b" }]);
        stream.close();
    });

    it("does not open a URL resolved for a session that ended while it resolved", async () => {
        const session = { user: "a" };
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        let first = true;
        const stream = createEventStream(
            async () => {
                const user = session.user;
                if (first) {
                    first = false;
                    await gate;
                }
                return `https://api.example.com/sse?ticket=${user}`;
            },
            { sessionKey: () => session.user },
        );
        await vi.advanceTimersByTimeAsync(0);
        session.user = "b";
        release();
        await vi.advanceTimersByTimeAsync(0);

        expect(EventSourceMock.instances.map((source) => source.url)).toEqual([
            "https://api.example.com/sse?ticket=b",
        ]);
        stream.close();
    });

    it("ignores a frame from a stream it already closed, even after the key changed", () => {
        let key: SessionKey = "user-a";
        const received: unknown[] = [];
        const stream = createEventStream("https://api.example.com/sse", {
            sessionKey: () => key,
            onMessage: ({ data }) => received.push(data),
        });
        stream.close();
        key = "user-b";
        EventSourceMock.instances[0].emit({ owner: "a" });

        expect(received).toEqual([]);
        expect(EventSourceMock.instances).toHaveLength(1);
        expect(stream.status).toBe("closed");
    });

    it("keeps one connection while the key stays the same", async () => {
        const received: unknown[] = [];
        const stream = createEventStream("https://api.example.com/sse", {
            sessionKey: () => 7,
            onMessage: ({ data }) => received.push(data),
        });
        EventSourceMock.instances[0].emit(1);
        EventSourceMock.instances[0].emit(2);

        expect(EventSourceMock.instances).toHaveLength(1);
        expect(received).toEqual([1, 2]);
        stream.close();
    });
});

describe("session-bound streams: ticket", () => {
    beforeEach(() => {
        EventSourceMock.instances = [];
        vi.stubGlobal("EventSource", EventSourceMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("createTicketEventStream asks a ticket for the new session instead of delivering the old one", async () => {
        const session = { user: "a" };
        const received: unknown[] = [];
        const stream = createTicketEventStream({
            client: client(ticketBackend(session)),
            sessionKey: () => session.user,
            onMessage: ({ data }) => received.push(data),
        });
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));
        session.user = "b";
        EventSourceMock.instances[0].emit({ owner: "a" });
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(2));

        expect(received).toEqual([]);
        expect(EventSourceMock.instances[1].url).toContain("ticket=ticket-of-b");
        stream.close();
    });

    it("useTicketEventStream drops the stream of user A when the tab switches to user B", async () => {
        const session = { user: "a" };
        const api = client(ticketBackend(session));
        const received: EventStreamMessage<unknown>[] = [];
        const { result, rerender, unmount } = renderHook(
            ({ user }: { user: string }) =>
                useTicketEventStream({
                    client: api,
                    sessionKey: user,
                    onMessage: (message) => received.push(message),
                }),
            { initialProps: { user: "a" } },
        );
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));
        const streamOfA = EventSourceMock.instances[0];
        act(() => streamOfA.emit({ owner: "a" }));
        expect(result.current.lastMessage?.data).toEqual({ owner: "a" });

        session.user = "b";
        rerender({ user: "b" });
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(2));
        act(() => streamOfA.emit({ owner: "a", afterSwitch: true }));

        expect(streamOfA.closed).toBe(true);
        expect(EventSourceMock.instances[1].url).toContain("ticket=ticket-of-b");
        expect(received.map((message) => message.data)).toEqual([{ owner: "a" }]);
        expect(result.current.lastMessage).toBeNull();
        unmount();
    });
});

describe("session-bound streams: useEventStream", () => {
    beforeEach(() => {
        EventSourceMock.instances = [];
        vi.stubGlobal("EventSource", EventSourceMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reopens a fixed-URL stream when the session key changes", () => {
        const { rerender, unmount } = renderHook(
            ({ user }: { user: SessionKey }) =>
                useEventStream("https://api.example.com/sse", { sessionKey: user }),
            { initialProps: { user: "a" as SessionKey } },
        );
        rerender({ user: "b" });

        expect(EventSourceMock.instances).toHaveLength(2);
        expect(EventSourceMock.instances[0].closed).toBe(true);
        unmount();
    });

    it("does not reopen when the component re-renders with the same key", () => {
        const { rerender, unmount } = renderHook(
            ({ user }: { user: SessionKey }) =>
                useEventStream("https://api.example.com/sse", { sessionKey: user }),
            { initialProps: { user: "a" as SessionKey } },
        );
        rerender({ user: "a" });
        rerender({ user: "a" });

        expect(EventSourceMock.instances).toHaveLength(1);
        unmount();
    });

    it("does not show the last message of the previous session while disabled", () => {
        const { result, rerender, unmount } = renderHook(
            ({ user }: { user: SessionKey }) =>
                useEventStream("https://api.example.com/sse", {
                    sessionKey: user,
                    enabled: user !== null,
                }),
            { initialProps: { user: "a" as SessionKey } },
        );
        act(() => EventSourceMock.instances[0].emit({ owner: "a" }));
        expect(result.current.lastMessage?.data).toEqual({ owner: "a" });
        rerender({ user: null });

        expect(result.current.lastMessage).toBeNull();
        unmount();
    });

    it("keeps the last message across a toggle of enabled within the same session", () => {
        const { result, rerender, unmount } = renderHook(
            ({ enabled }: { enabled: boolean }) =>
                useEventStream("https://api.example.com/sse", { sessionKey: "a", enabled }),
            { initialProps: { enabled: true } },
        );
        act(() => EventSourceMock.instances[0].emit({ owner: "a" }));
        rerender({ enabled: false });

        expect(result.current.lastMessage?.data).toEqual({ owner: "a" });
        unmount();
    });
});

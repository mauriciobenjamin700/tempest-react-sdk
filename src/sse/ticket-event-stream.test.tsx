import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "../http/api-client";
import { TempestApiError } from "../http/errors";
import {
    createTicketEventStream,
    isRetriableTicketError,
    useTicketEventStream,
} from "./ticket-event-stream";

class EventSourceMock {
    static instances: EventSourceMock[] = [];
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    constructor(
        public url: string,
        public init?: EventSourceInit,
    ) {
        EventSourceMock.instances.push(this);
    }
    addEventListener(): void {}
    close(): void {}
}

interface Call {
    url: string;
    init: RequestInit;
}

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function backend(responses: Response[]): { fetcher: typeof fetch; calls: Call[] } {
    const calls: Call[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init: init ?? {} });
        const next = responses.shift();
        if (!next) throw new Error("no response queued");
        return next;
    }) as unknown as typeof fetch;
    return { fetcher, calls };
}

function client(fetcher: typeof fetch) {
    return createApiClient({
        baseURL: "https://api.example.com",
        prefix: "/api",
        getToken: () => "access-token",
        fetcher,
    });
}

async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
}

describe("createTicketEventStream", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        EventSourceMock.instances = [];
        vi.stubGlobal("EventSource", EventSourceMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("requests the ticket through the authenticated client and opens the stream with it", async () => {
        const { fetcher, calls } = backend([json(200, { ticket: "t1", expires_in: 60 })]);
        const stream = createTicketEventStream({ client: client(fetcher) });
        await settle();

        expect(calls[0].url).toBe("https://api.example.com/api/sse/ticket");
        expect(calls[0].init.method).toBe("POST");
        expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
            "Bearer access-token",
        );
        expect(EventSourceMock.instances.map((source) => source.url)).toEqual([
            "https://api.example.com/api/sse/stream?ticket=t1",
        ]);
        stream.close();
    });

    it("never puts the access token in the stream URL", async () => {
        const { fetcher } = backend([json(200, { ticket: "t1", expires_in: 60 })]);
        const stream = createTicketEventStream({ client: client(fetcher) });
        await settle();
        expect(EventSourceMock.instances[0].url).not.toContain("access-token");
        expect(EventSourceMock.instances[0].url).not.toContain("access_token");
        stream.close();
    });

    it("requests a new ticket for the reconnect instead of replaying the expired one", async () => {
        const { fetcher, calls } = backend([
            json(200, { ticket: "t1", expires_in: 60 }),
            json(200, { ticket: "t2", expires_in: 60 }),
        ]);
        const stream = createTicketEventStream({ client: client(fetcher), initialBackoff: 10 });
        await settle();
        await vi.advanceTimersByTimeAsync(61_000);
        EventSourceMock.instances[0].onerror?.(new Event("error"));
        await vi.advanceTimersByTimeAsync(10);

        expect(calls.map((call) => call.url)).toEqual([
            "https://api.example.com/api/sse/ticket",
            "https://api.example.com/api/sse/ticket",
        ]);
        expect(EventSourceMock.instances.map((source) => source.url)).toEqual([
            "https://api.example.com/api/sse/stream?ticket=t1",
            "https://api.example.com/api/sse/stream?ticket=t2",
        ]);
        stream.close();
    });

    it("honours a custom router prefix and ticket param", async () => {
        const { fetcher, calls } = backend([json(200, { ticket: "t1", expires_in: 60 })]);
        const stream = createTicketEventStream({
            client: client(fetcher),
            prefix: "/events",
            ticketParam: "t",
        });
        await settle();
        expect(calls[0].url).toBe("https://api.example.com/api/events/ticket");
        expect(EventSourceMock.instances[0].url).toBe(
            "https://api.example.com/api/events/stream?t=t1",
        );
        stream.close();
    });

    it.each([
        [401, "UNAUTHORIZED"],
        [403, "ACCOUNT_INACTIVE"],
    ])("stops without retrying when the ticket is refused with %i", async (status, code) => {
        const { fetcher, calls } = backend([
            json(status, { detail: "no", code }),
            json(200, { ticket: "never", expires_in: 60 }),
        ]);
        const onUrlError = vi.fn();
        const stream = createTicketEventStream({
            client: client(fetcher),
            initialBackoff: 10,
            onUrlError,
        });
        await settle();
        await vi.advanceTimersByTimeAsync(1000);

        expect(calls).toHaveLength(1);
        expect(stream.status).toBe("error");
        expect(EventSourceMock.instances).toHaveLength(0);
        expect(onUrlError).toHaveBeenCalledWith(expect.objectContaining({ status }));
    });

    it("retries a ticket request that failed with a 503", async () => {
        const { fetcher, calls } = backend([
            json(503, { detail: "down" }),
            json(200, { ticket: "t1", expires_in: 60 }),
        ]);
        const stream = createTicketEventStream({ client: client(fetcher), initialBackoff: 10 });
        await settle();
        await vi.advanceTimersByTimeAsync(10);
        expect(calls).toHaveLength(2);
        expect(EventSourceMock.instances.map((source) => source.url)).toEqual([
            "https://api.example.com/api/sse/stream?ticket=t1",
        ]);
        stream.close();
    });

    it("refuses a ticket response without a ticket and does not retry it", async () => {
        const { fetcher } = backend([json(200, { expires_in: 60 })]);
        const onUrlError = vi.fn();
        const stream = createTicketEventStream({ client: client(fetcher), onUrlError });
        await settle();
        expect(onUrlError).toHaveBeenCalledWith(expect.any(TypeError));
        expect(stream.status).toBe("error");
    });

    it("lets the caller replace the retry policy", async () => {
        const { fetcher, calls } = backend([
            json(403, { detail: "no" }),
            json(200, { ticket: "t1", expires_in: 60 }),
        ]);
        const stream = createTicketEventStream({
            client: client(fetcher),
            initialBackoff: 10,
            shouldRetryUrl: () => true,
        });
        await settle();
        await vi.advanceTimersByTimeAsync(10);
        expect(calls).toHaveLength(2);
        stream.close();
    });
});

describe("isRetriableTicketError", () => {
    it.each([
        [0, true],
        [429, true],
        [503, true],
        [400, false],
        [401, false],
        [403, false],
        [404, false],
    ])("status %i → %s", (status, expected) => {
        expect(isRetriableTicketError(new TempestApiError({ status, detail: "x" }))).toBe(expected);
    });

    it("does not retry an error that is not from the API", () => {
        expect(isRetriableTicketError(new TypeError("bad shape"))).toBe(false);
    });
});

describe("useTicketEventStream", () => {
    beforeEach(() => {
        EventSourceMock.instances = [];
        vi.stubGlobal("EventSource", EventSourceMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("opens the ticket stream once and keeps it across re-renders", async () => {
        const fetcher = vi.fn(async () =>
            json(200, { ticket: "t1", expires_in: 60 }),
        ) as unknown as typeof fetch;
        const api = client(fetcher);
        const { rerender, unmount } = renderHook(() => useTicketEventStream({ client: api }));
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));
        rerender();
        rerender();
        await Promise.resolve();
        expect(EventSourceMock.instances).toHaveLength(1);
        expect(fetcher).toHaveBeenCalledOnce();
        unmount();
    });

    it("does not request a ticket while disabled", () => {
        const fetcher = vi.fn() as unknown as typeof fetch;
        const { result } = renderHook(() =>
            useTicketEventStream({ client: client(fetcher), enabled: false }),
        );
        expect(result.current.status).toBe("idle");
        expect(fetcher).not.toHaveBeenCalled();
    });
});

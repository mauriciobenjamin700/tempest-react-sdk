import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempestAuth, type TempestAuth } from "../auth/create-tempest-auth";
import { createApiClient } from "../http/api-client";
import type { EventStreamMessage } from "./create-event-stream";
import { createTicketEventStream, useTicketEventStream } from "./ticket-event-stream";

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

interface User {
    id: string;
}

type Auth = TempestAuth<User, { email: string; password: string }>;

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

/**
 * A backend for two accounts: login issues `<A|B>-tok-1`, every refresh
 * rotates the token of the account that holds it, and the SSE ticket names
 * the account whose bearer asked for it — so each `EventSource` URL says whose
 * stream it is. A ticket asked without a bearer is a `401`.
 *
 * @returns The fetcher and the bearers every ticket request carried.
 */
function backend(): { fetcher: typeof fetch; tickets: (string | undefined)[] } {
    const tickets: (string | undefined)[] = [];
    let rotations = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        const headers = (init?.headers ?? {}) as Record<string, string>;
        const bearer = headers.Authorization?.replace("Bearer ", "");
        const body = init?.body ? (JSON.parse(String(init.body)) as { email?: string }) : {};
        if (path === "/api/auth/login") {
            const who = body.email === "b@x.test" ? "B" : "A";
            return json(200, { access_token: `${who}-tok-1`, refresh_token: `${who}-ref` });
        }
        if (path === "/api/auth/refresh") {
            rotations += 1;
            return json(200, { access_token: `A-tok-r${rotations}`, refresh_token: "A-ref" });
        }
        if (path === "/sse/ticket") {
            tickets.push(bearer);
            if (!bearer) return json(401, { detail: "anonymous" });
            return json(200, { ticket: `ticket-of-${bearer.slice(0, 1)}`, expires_in: 60 });
        }
        return json(404, {});
    }) as unknown as typeof fetch;
    return { fetcher, tickets };
}

function preset(fetcher: typeof fetch): Auth {
    return createTempestAuth<User>({ baseURL: "https://api.example.com", fetcher });
}

describe("ticket streams bound to the session of createTempestAuth", () => {
    let auth: Auth;
    let server: ReturnType<typeof backend>;

    beforeEach(() => {
        localStorage.clear();
        EventSourceMock.instances = [];
        vi.stubGlobal("EventSource", EventSourceMock);
        server = backend();
        auth = preset(server.fetcher);
    });

    afterEach(() => {
        auth.dispose();
        vi.unstubAllGlobals();
    });

    it("stops delivering A's stream once the tab signs in as B, without a sessionKey", async () => {
        await auth.login({ email: "a@x.test", password: "x" });
        const received: EventStreamMessage<unknown>[] = [];
        const { result, unmount } = renderHook(() =>
            useTicketEventStream({
                client: auth.api,
                onMessage: (message) => received.push(message),
            }),
        );
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));
        const streamOfA = EventSourceMock.instances[0];
        expect(streamOfA.url).toContain("ticket=ticket-of-A");
        act(() => streamOfA.emit({ owner: "a" }));

        await act(() => auth.login({ email: "b@x.test", password: "x" }));
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(2));
        act(() => streamOfA.emit({ owner: "a", afterSwitch: true }));

        expect(streamOfA.closed).toBe(true);
        expect(EventSourceMock.instances[1].url).toContain("ticket=ticket-of-B");
        expect(received.map((message) => message.data)).toEqual([{ owner: "a" }]);
        expect(result.current.lastMessage).toBeNull();
        unmount();
    });

    it("keeps the same stream open across a token rotation of the same session", async () => {
        await auth.login({ email: "a@x.test", password: "x" });
        const sessionBefore = auth.sessionKey();
        const { unmount } = renderHook(() => useTicketEventStream({ client: auth.api }));
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));

        await act(() => auth.refresh());

        expect(auth.getToken()).toBe("A-tok-r1");
        expect(auth.sessionKey()).toBe(sessionBefore);
        expect(EventSourceMock.instances).toHaveLength(1);
        expect(EventSourceMock.instances[0].closed).toBe(false);
        unmount();
    });

    it("closes on logout and asks no ticket while nobody is signed in", async () => {
        await auth.login({ email: "a@x.test", password: "x" });
        const { result, unmount } = renderHook(() => useTicketEventStream({ client: auth.api }));
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));

        await act(() => auth.logout());

        expect(EventSourceMock.instances[0].closed).toBe(true);
        expect(result.current.status).toBe("idle");
        expect(server.tickets).toEqual(["A-tok-1"]);
        unmount();
    });

    it("does not open before the sign-in and opens for the session it brings", async () => {
        const { unmount } = renderHook(() => useTicketEventStream({ client: auth.api }));
        await act(() => Promise.resolve());
        expect(EventSourceMock.instances).toHaveLength(0);

        await act(() => auth.login({ email: "b@x.test", password: "x" }));

        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));
        expect(EventSourceMock.instances[0].url).toContain("ticket=ticket-of-B");
        expect(server.tickets).toEqual(["B-tok-1"]);
        unmount();
    });

    it("lets an explicit sessionKey win over the client's session", async () => {
        await auth.login({ email: "a@x.test", password: "x" });
        const { unmount } = renderHook(() =>
            useTicketEventStream({ client: auth.api, sessionKey: "pinned" }),
        );
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));

        await act(() => auth.login({ email: "b@x.test", password: "x" }));
        await act(() => Promise.resolve());

        expect(EventSourceMock.instances).toHaveLength(1);
        expect(EventSourceMock.instances[0].closed).toBe(false);
        unmount();
    });

    it("follows a sign-in another tab made into the shared storage", async () => {
        await auth.login({ email: "a@x.test", password: "x" });
        const { unmount } = renderHook(() => useTicketEventStream({ client: auth.api }));
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));
        const other = preset(server.fetcher);

        await act(async () => {
            await other.login({ email: "b@x.test", password: "x" });
            window.dispatchEvent(
                new StorageEvent("storage", {
                    key: "tempest-auth",
                    storageArea: localStorage,
                }),
            );
        });

        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(2));
        expect(EventSourceMock.instances[0].closed).toBe(true);
        expect(EventSourceMock.instances[1].url).toContain("ticket=ticket-of-B");
        other.dispose();
        unmount();
    });

    it("createTicketEventStream closes A's stream at the switch, not at its next frame", async () => {
        await auth.login({ email: "a@x.test", password: "x" });
        const received: unknown[] = [];
        const stream = createTicketEventStream({
            client: auth.api,
            onMessage: ({ data }) => received.push(data),
        });
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));
        const streamOfA = EventSourceMock.instances[0];

        await auth.login({ email: "b@x.test", password: "x" });

        expect(streamOfA.closed).toBe(true);
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(2));
        streamOfA.emit({ owner: "a" });
        expect(received).toEqual([]);
        expect(EventSourceMock.instances[1].url).toContain("ticket=ticket-of-B");
        stream.close();
    });

    it("createTicketEventStream ignores a rotation and stays closed while signed out", async () => {
        await auth.login({ email: "a@x.test", password: "x" });
        const stream = createTicketEventStream({ client: auth.api });
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));

        await auth.refresh();
        expect(EventSourceMock.instances).toHaveLength(1);
        expect(EventSourceMock.instances[0].closed).toBe(false);

        await auth.logout();
        await Promise.resolve();
        expect(EventSourceMock.instances[0].closed).toBe(true);
        expect(stream.status).toBe("closed");
        expect(server.tickets).toEqual(["A-tok-1"]);
        stream.close();
    });

    it("createTicketEventStream created signed out asks no ticket until a sign-in", async () => {
        const stream = createTicketEventStream({ client: auth.api });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(server.tickets).toEqual([]);

        await auth.login({ email: "a@x.test", password: "x" });

        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));
        expect(server.tickets).toEqual(["A-tok-1"]);
        stream.close();
    });

    it("createTicketEventStream stops following the session after close()", async () => {
        await auth.login({ email: "a@x.test", password: "x" });
        const stream = createTicketEventStream({ client: auth.api });
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));
        stream.close();

        await auth.login({ email: "b@x.test", password: "x" });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(EventSourceMock.instances).toHaveLength(1);
        expect(stream.status).toBe("closed");
    });

    it("createTicketEventStream follows again after reconnect()", async () => {
        await auth.login({ email: "a@x.test", password: "x" });
        const stream = createTicketEventStream({ client: auth.api });
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));
        stream.close();
        stream.reconnect();
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(2));

        await auth.login({ email: "b@x.test", password: "x" });

        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(3));
        expect(EventSourceMock.instances[1].closed).toBe(true);
        expect(EventSourceMock.instances[2].url).toContain("ticket=ticket-of-B");
        stream.close();
    });

    it("keeps today's behaviour for a client createTempestAuth did not build", async () => {
        let token = "A-tok-1";
        const api = createApiClient({
            baseURL: "https://api.example.com",
            getToken: () => token,
            fetcher: server.fetcher,
        });
        const { unmount } = renderHook(() => useTicketEventStream({ client: api }));
        await vi.waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));

        token = "B-tok-1";
        act(() => EventSourceMock.instances[0].emit({ owner: "a" }));

        expect(EventSourceMock.instances).toHaveLength(1);
        expect(EventSourceMock.instances[0].closed).toBe(false);
        unmount();
    });
});

describe("auth.sessionKey", () => {
    let server: ReturnType<typeof backend>;

    beforeEach(() => {
        localStorage.clear();
        server = backend();
    });

    it("is null signed out, survives rotation and changes with every login", async () => {
        const auth = preset(server.fetcher);
        expect(auth.sessionKey()).toBeNull();

        await auth.login({ email: "a@x.test", password: "x" });
        const first = auth.sessionKey();
        expect(first).toEqual(expect.any(String));
        await auth.refresh();
        expect(auth.sessionKey()).toBe(first);

        await auth.login({ email: "a@x.test", password: "x" });
        expect(auth.sessionKey()).not.toBe(first);
        expect(auth.sessionKey()).not.toBeNull();

        await auth.logout();
        expect(auth.sessionKey()).toBeNull();
        auth.dispose();
    });

    it("is never the token itself", async () => {
        const auth = preset(server.fetcher);
        await auth.login({ email: "a@x.test", password: "x" });

        expect(auth.sessionKey()).not.toContain("tok");
        auth.dispose();
    });

    /**
     * Until #561 this asserted the constant `"unlineaged"`. That constant was
     * the key of every session without a lineage — of any account — so two of
     * them could not be told apart, and an upload bound to one was resumed by
     * the next. The key is now minted per session.
     */
    it("answers a key of its own for a signed-in session persisted without a lineage", () => {
        localStorage.setItem(
            "tempest-auth",
            JSON.stringify({ state: { user: { id: "A" }, token: "A-tok-0" }, version: 0 }),
        );
        const auth = preset(server.fetcher);

        expect(auth.sessionKey()).not.toBeNull();
        expect(auth.sessionKey()).not.toBe("unlineaged");
        expect(auth.sessionKey()).toBe(auth.sessionKey());
        auth.dispose();
    });
});

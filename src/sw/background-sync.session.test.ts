import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDevBuild } from "../utils/dev-mode";
import { DEFAULT_CREDENTIAL_HEADERS } from "./credential-headers";
import {
    BACKGROUND_SYNC_CREDENTIALS_MESSAGE,
    clearBackgroundSyncQueue,
    installBackgroundSync,
    provideBackgroundSyncCredentials,
} from "./background-sync";

type Listener = (event: unknown) => void;

interface StoredEntry {
    url: string;
    headers: [string, string][];
    credentials?: RequestCredentials;
    strippedHeaders?: string[];
    owner?: string | null;
    ownerState?: string;
}

interface FakeClient {
    postMessage: ReturnType<typeof vi.fn>;
}

const ORIGINAL: Record<string, unknown> = {};
const STUB_KEYS = ["addEventListener", "registration", "fetch", "clients"];

let listeners: Record<string, Listener[]>;
let fetchMock: ReturnType<typeof vi.fn>;
let windowClients: FakeClient[];
let issuers: Record<string, FakeClient>;
let extended: Promise<unknown>[];
let queueCounter = 0;

function stubSw(): void {
    listeners = { fetch: [], sync: [] };
    fetchMock = vi.fn();
    windowClients = [];
    issuers = {};
    extended = [];
    const sw: Record<string, unknown> = {
        addEventListener: (name: string, listener: Listener) => {
            (listeners[name] ??= []).push(listener);
        },
        registration: { sync: { register: vi.fn().mockResolvedValue(undefined) } },
        fetch: fetchMock,
        clients: {
            matchAll: vi.fn(async () => windowClients),
            get: vi.fn(async (id: string) => issuers[id]),
        },
    };
    for (const key of STUB_KEYS) {
        ORIGINAL[key] = (globalThis as Record<string, unknown>)[key];
        Object.defineProperty(globalThis, key, {
            value: sw[key],
            configurable: true,
            writable: true,
        });
    }
}

beforeEach(stubSw);

afterEach(() => {
    for (const key of STUB_KEYS) {
        if (ORIGINAL[key] === undefined) delete (globalThis as Record<string, unknown>)[key];
        else
            Object.defineProperty(globalThis, key, {
                value: ORIGINAL[key],
                configurable: true,
                writable: true,
            });
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
});

function nextQueue(): string {
    queueCounter += 1;
    return `test-session-q-${queueCounter}`;
}

function readQueue(name: string): Promise<StoredEntry[]> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onupgradeneeded = () => {
            if (!open.result.objectStoreNames.contains("requests"))
                open.result.createObjectStore("requests", { keyPath: "id", autoIncrement: true });
        };
        open.onsuccess = () => {
            const db = open.result;
            const req = db.transaction("requests", "readonly").objectStore("requests").getAll();
            req.onsuccess = () => {
                resolve(req.result as StoredEntry[]);
                db.close();
            };
            req.onerror = () => reject(req.error);
        };
        open.onerror = () => reject(open.error);
    });
}

async function failOffline(request: Request, clientId?: string): Promise<void> {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    let produced: Promise<Response> | undefined;
    listeners.fetch[0]?.({
        request,
        clientId,
        respondWith: (r: Response | Promise<Response>) => {
            produced = Promise.resolve(r);
        },
        waitUntil: (p: Promise<unknown>) => extended.push(p),
    });
    await produced?.catch(() => undefined);
    await Promise.all(extended);
}

async function fireSync(queue: string): Promise<void> {
    let drained: Promise<unknown> | undefined;
    listeners.sync[0]?.({ tag: queue, waitUntil: (p: Promise<unknown>) => (drained = p) });
    await drained?.catch(() => undefined);
}

function postAs(token: string, extra: Record<string, string> = {}): Request {
    return new Request("https://app.test/api/items", {
        method: "POST",
        body: '{"x":1}',
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...extra,
        },
    });
}

function answeringClient(answer: unknown): FakeClient {
    return {
        postMessage: vi.fn((_message: unknown, transfer: MessagePort[]) => {
            transfer[0]?.postMessage(answer);
        }),
    };
}

describe("installBackgroundSync — credentials never reach IndexedDB (#444)", () => {
    it("strips Authorization and the other credential headers before persisting", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(postAs("A", { "X-Api-Key": "k" }));

        const [entry] = await readQueue(queue);
        const names = entry?.headers.map(([name]) => name.toLowerCase());
        expect(names).toContain("content-type");
        expect(names).not.toContain("authorization");
        expect(names).not.toContain("x-api-key");
        expect(JSON.stringify(entry)).not.toContain("Bearer A");
        expect(entry?.strippedHeaders).toEqual(["authorization", "x-api-key"]);
    });

    it("persists every header when credentialHeaders is emptied on purpose", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue, credentialHeaders: [] });
        await failOffline(postAs("A"));
        const [entry] = await readQueue(queue);
        expect(entry?.headers).toContainEqual(["authorization", "Bearer A"]);
    });

    it("strips a custom credential header added to the defaults", async () => {
        const queue = nextQueue();
        installBackgroundSync({
            queueName: queue,
            credentialHeaders: [...DEFAULT_CREDENTIAL_HEADERS, "X-Tenant-Key"],
        });
        await failOffline(
            new Request("https://app.test/api/t", {
                method: "POST",
                body: "x",
                headers: { "x-tenant-key": "t" },
            }),
        );
        const [entry] = await readQueue(queue);
        expect(entry?.strippedHeaders).toEqual(["x-tenant-key"]);
    });

    it("keeps the credentials mode so cookie-based APIs replay with cookies", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(
            new Request("https://app.test/api/c", {
                method: "POST",
                body: "x",
                credentials: "include",
            }),
        );
        const [entry] = await readQueue(queue);
        expect(entry?.credentials).toBe("include");

        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        await fireSync(queue);
        expect((fetchMock.mock.calls.at(-1)?.[0] as Request).credentials).toBe("include");
    });
});

describe("installBackgroundSync — replay re-applies the current credentials", () => {
    it("asks an open page and applies only the header names that were stripped", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(postAs("A"));

        const client = answeringClient({
            headers: { Authorization: "Bearer NOW", "X-Injected": "nope" },
        });
        windowClients = [client];
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        await fireSync(queue);

        expect(client.postMessage.mock.calls[0]?.[0]).toEqual({
            type: BACKGROUND_SYNC_CREDENTIALS_MESSAGE,
            url: "https://app.test/api/items",
            method: "POST",
            phase: "replay",
        });
        const sent = fetchMock.mock.calls.at(-1)?.[0] as Request;
        expect(sent.headers.get("authorization")).toBe("Bearer NOW");
        expect(sent.headers.get("x-injected")).toBeNull();
        expect(await sent.text()).toBe('{"x":1}');
        expect(await readQueue(queue)).toEqual([]);
    });

    it("drops the entry without sending it when the page reports no session", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(postAs("A"));
        fetchMock.mockClear();

        windowClients = [answeringClient({ headers: null })];
        await fireSync(queue);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await readQueue(queue)).toEqual([]);
    });

    it("keeps the entry pending, unsent, while no page can answer", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(postAs("A"));
        fetchMock.mockClear();

        windowClients = [answeringClient("not-an-answer")];
        await fireSync(queue);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await readQueue(queue)).toHaveLength(1);
    });

    it("gives up on a page that never answers after the timeout", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(postAs("A"));
        fetchMock.mockClear();

        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        windowClients = [{ postMessage: vi.fn() }];
        let drained: Promise<unknown> | undefined;
        listeners.sync[0]?.({ tag: queue, waitUntil: (p: Promise<unknown>) => (drained = p) });
        const outcome = (drained as Promise<unknown>).then(
            () => "resolved",
            (error: Error) => error.message,
        );
        await vi.waitFor(() => expect(windowClients[0]?.postMessage).toHaveBeenCalled());
        await vi.advanceTimersByTimeAsync(3000);
        expect(await outcome).toContain("still pending");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("replays an entry that carried no credentials without asking any page", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(new Request("https://app.test/api/anon", { method: "POST", body: "x" }));
        const client = answeringClient({ headers: null });
        windowClients = [client];
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        await fireSync(queue);
        expect(client.postMessage).not.toHaveBeenCalled();
        expect(await readQueue(queue)).toEqual([]);
    });

    it("lets a custom beforeReplay authorize, drop or postpone each entry", async () => {
        const queue = nextQueue();
        const beforeReplay = vi
            .fn()
            .mockImplementationOnce((request: Request) => {
                const headers = new Headers(request.headers);
                headers.set("Authorization", "Bearer HOOK");
                return new Request(request, { headers });
            })
            .mockImplementationOnce(() => null)
            .mockImplementationOnce(() => {
                throw new Error("token unavailable");
            });
        installBackgroundSync({ queueName: queue, beforeReplay });
        await failOffline(postAs("A"));
        await failOffline(postAs("A"));
        await failOffline(postAs("A"));
        fetchMock.mockClear();
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

        await fireSync(queue);
        expect(beforeReplay.mock.calls[0]?.[1]).toEqual({
            queuedAt: expect.any(Number),
            strippedHeaders: ["authorization"],
            ownerState: "unknown",
            owner: undefined,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect((fetchMock.mock.calls[0]?.[0] as Request).headers.get("authorization")).toBe(
            "Bearer HOOK",
        );
        expect(await readQueue(queue)).toHaveLength(1);
    });
});

describe("clearBackgroundSyncQueue", () => {
    it("deletes every pending request so the next session cannot replay it", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(postAs("A"));
        expect(await readQueue(queue)).toHaveLength(1);

        expect(await clearBackgroundSyncQueue(queue)).toBe(true);
        expect(await readQueue(queue)).toEqual([]);
    });

    it("resolves false where IndexedDB does not exist", async () => {
        vi.stubGlobal("indexedDB", undefined);
        expect(await clearBackgroundSyncQueue()).toBe(false);
        vi.unstubAllGlobals();
    });

    it("rejects when the queue database cannot be opened", async () => {
        const request: { onsuccess?: () => void; onerror?: () => void; error: Error } = {
            error: new Error("denied"),
        };
        vi.stubGlobal("indexedDB", {
            open: () => {
                queueMicrotask(() => request.onerror?.());
                return request;
            },
        });
        await expect(clearBackgroundSyncQueue("x")).rejects.toThrow("denied");
        vi.unstubAllGlobals();
    });
});

describe("provideBackgroundSyncCredentials", () => {
    let container: EventTarget;

    beforeEach(() => {
        container = new EventTarget();
        vi.stubGlobal("navigator", { serviceWorker: container });
    });

    afterEach(() => vi.unstubAllGlobals());

    function ask(data: unknown): Promise<unknown> {
        const channel = new MessageChannel();
        const answer = new Promise<unknown>((resolve) => {
            channel.port1.onmessage = (event: MessageEvent) => resolve(event.data);
            setTimeout(() => resolve("no-answer"), 50);
        });
        container.dispatchEvent(new MessageEvent("message", { data, ports: [channel.port2] }));
        return answer.finally(() => channel.port1.close());
    }

    it("answers the worker with the headers for the queued request", async () => {
        const getHeaders = vi.fn(async () => ({ Authorization: "Bearer NOW" }));
        provideBackgroundSyncCredentials(getHeaders);
        const answer = await ask({
            type: BACKGROUND_SYNC_CREDENTIALS_MESSAGE,
            url: "https://app.test/api/items",
            method: "POST",
        });
        expect(answer).toEqual({ headers: { Authorization: "Bearer NOW" } });
        expect(getHeaders).toHaveBeenCalledWith({
            url: "https://app.test/api/items",
            method: "POST",
            phase: "replay",
        });
    });

    it("answers null when there is no session", async () => {
        provideBackgroundSyncCredentials(() => null);
        expect(
            await ask({ type: BACKGROUND_SYNC_CREDENTIALS_MESSAGE, url: "u", method: "POST" }),
        ).toEqual({ headers: null });
    });

    it("answers an explicit error when the provider throws, instead of going silent", async () => {
        /**
         * Rewritten on purpose (review item 2): this test used to expect silence.
         * Silence costs the worker the full timeout and cannot be told apart from a
         * page without a provider; an explicit error keeps the entry pending at once.
         */
        provideBackgroundSyncCredentials(() => {
            throw new Error("store not ready");
        });
        expect(
            await ask({ type: BACKGROUND_SYNC_CREDENTIALS_MESSAGE, url: "u", method: "POST" }),
        ).toEqual({ error: true });
    });

    it("ignores other messages and stops answering once removed", async () => {
        const stop = provideBackgroundSyncCredentials(() => ({ Authorization: "x" }));
        expect(await ask({ type: "SKIP_WAITING" })).toBe("no-answer");
        container.dispatchEvent(
            new MessageEvent("message", { data: { type: BACKGROUND_SYNC_CREDENTIALS_MESSAGE } }),
        );
        stop();
        expect(
            await ask({ type: BACKGROUND_SYNC_CREDENTIALS_MESSAGE, url: "u", method: "POST" }),
        ).toBe("no-answer");
    });

    it("is a no-op without service-worker support", () => {
        vi.stubGlobal("navigator", {});
        expect(provideBackgroundSyncCredentials(() => null)()).toBeUndefined();
    });
});

describe("installBackgroundSync — entries are bound to their owner", () => {
    let container: EventTarget;
    let principal: string | null;
    let token: string | null;

    beforeEach(() => {
        container = new EventTarget();
        vi.stubGlobal("navigator", { serviceWorker: container });
        principal = "user-a";
        token = "A";
        provideBackgroundSyncCredentials(
            () => (token ? { Authorization: `Bearer ${token}` } : null),
            {
                getPrincipal: () => principal,
            },
        );
    });

    afterEach(() => vi.unstubAllGlobals());

    function page(): FakeClient {
        return {
            postMessage: vi.fn((data: unknown, transfer: MessagePort[]) => {
                container.dispatchEvent(new MessageEvent("message", { data, ports: transfer }));
            }),
        };
    }

    it("never sends A's queued mutation with B's credentials when logout skipped the cleanup", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        issuers = { tab: page() };
        await failOffline(postAs("A"), "tab");
        const [entry] = await readQueue(queue);
        expect(entry?.owner).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(entry)).not.toContain("user-a");

        principal = "user-b";
        token = "B";
        windowClients = [page()];
        fetchMock.mockClear();
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        await fireSync(queue);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(await readQueue(queue)).toEqual([]);
    });

    it("sends the owner's mutation with the owner's refreshed token", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        issuers = { tab: page() };
        await failOffline(postAs("A"), "tab");

        token = "A2";
        windowClients = [page()];
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        await fireSync(queue);

        const sent = fetchMock.mock.calls.at(-1)?.[0] as Request;
        expect(sent.headers.get("authorization")).toBe("Bearer A2");
        expect(await readQueue(queue)).toEqual([]);
    });

    it("drops a mutation queued while signed out once somebody is signed in", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        principal = null;
        issuers = { tab: page() };
        await failOffline(
            new Request("https://app.test/api/x", { method: "POST", body: "x" }),
            "tab",
        );
        expect((await readQueue(queue))[0]?.owner).toBeNull();

        principal = "user-b";
        windowClients = [page()];
        fetchMock.mockClear();
        await fireSync(queue);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("checks the owner of a cookie-session mutation that carried no credential header", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        issuers = { tab: page() };
        await failOffline(
            new Request("https://app.test/api/c", {
                method: "POST",
                body: "x",
                credentials: "include",
            }),
            "tab",
        );
        await failOffline(
            new Request("https://app.test/api/c", {
                method: "POST",
                body: "y",
                credentials: "include",
            }),
            "tab",
        );

        windowClients = [page()];
        fetchMock.mockClear();
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        await fireSync(queue);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("waits while the owner is still being stamped, then treats a lost stamp as unknown", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        let port: MessagePort | undefined;
        issuers = {
            tab: {
                postMessage: vi.fn((_data: unknown, transfer: MessagePort[]) => {
                    port = transfer[0];
                }),
            },
        };
        fetchMock.mockRejectedValueOnce(new Error("offline"));
        let produced: Promise<Response> | undefined;
        listeners.fetch[0]?.({
            request: new Request("https://app.test/api/p", { method: "POST", body: "x" }),
            clientId: "tab",
            respondWith: (r: Promise<Response>) => (produced = r),
            waitUntil: (p: Promise<unknown>) => extended.push(p),
        });
        await produced?.catch(() => undefined);
        expect((await readQueue(queue))[0]).toMatchObject({ ownerState: "pending" });

        fetchMock.mockClear();
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        await fireSync(queue);
        expect(fetchMock).not.toHaveBeenCalled();

        const now = Date.now();
        vi.spyOn(Date, "now").mockReturnValue(now + 10_000);
        await fireSync(queue);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        port?.postMessage({ headers: null, owner: "late" });
        await Promise.all(extended);
        expect(await readQueue(queue)).toEqual([]);
    });

    it("leaves the entry unbound when the issuing page has no principal getter", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        issuers = { tab: answeringClient({ headers: null }) };
        await failOffline(postAs("A"), "tab");
        const [entry] = await readQueue(queue);
        expect(entry).not.toHaveProperty("owner");
        expect(entry).toMatchObject({ ownerState: "unbound" });
    });

    it("answers the enqueue question with the owner only, without reading the token", async () => {
        const getHeaders = vi.fn(() => ({ Authorization: "Bearer x" }));
        const local = new EventTarget();
        vi.stubGlobal("navigator", { serviceWorker: local });
        provideBackgroundSyncCredentials(getHeaders, { getPrincipal: async () => "" });
        const channel = new MessageChannel();
        const answer = new Promise<unknown>((resolve) => {
            channel.port1.onmessage = (event: MessageEvent) => resolve(event.data);
        });
        local.dispatchEvent(
            new MessageEvent("message", {
                data: {
                    type: BACKGROUND_SYNC_CREDENTIALS_MESSAGE,
                    url: "u",
                    method: "POST",
                    phase: "enqueue",
                },
                ports: [channel.port2],
            }),
        );
        expect(await answer).toEqual({ headers: null, owner: null });
        expect(getHeaders).not.toHaveBeenCalled();
        channel.port1.close();
    });
});

interface FakePage extends FakeClient {
    signIn(principal: string | null, token: string | null): void;
}

/**
 * A window client with its own `navigator.serviceWorker` and a real provider,
 * so several tabs signed in as different people can answer the worker.
 */
function fakePage(principal: string | null, token: string | null, withPrincipal = true): FakePage {
    const container = new EventTarget();
    const state = { principal, token };
    vi.stubGlobal("navigator", { serviceWorker: container });
    provideBackgroundSyncCredentials(
        () => (state.token ? { Authorization: `Bearer ${state.token}` } : null),
        withPrincipal ? { getPrincipal: () => state.principal } : {},
    );
    vi.unstubAllGlobals();
    return {
        postMessage: vi.fn((data: unknown, transfer: MessagePort[]) => {
            container.dispatchEvent(new MessageEvent("message", { data, ports: transfer }));
        }),
        signIn(nextPrincipal: string | null, nextToken: string | null) {
            state.principal = nextPrincipal;
            state.token = nextToken;
        },
    };
}

function writeLegacyEntry(name: string, entry: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open(name, 1);
        open.onupgradeneeded = () =>
            open.result.createObjectStore("requests", { keyPath: "id", autoIncrement: true });
        open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction("requests", "readwrite");
            tx.objectStore("requests").add(entry);
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
    });
}

function sentAuthorizations(): (string | null)[] {
    return fetchMock.mock.calls.map(([request]) =>
        (request as Request).headers.get("authorization"),
    );
}

describe("background sync — review findings", () => {
    afterEach(() => setDevBuild(undefined));

    it("1: never replays the plaintext bearer of an entry queued before the fix", async () => {
        const queue = nextQueue();
        await writeLegacyEntry(queue, {
            url: "https://app.test/api/legacy",
            method: "POST",
            headers: [
                ["authorization", "Bearer OLD"],
                ["content-type", "application/json"],
            ],
            body: null,
            timestamp: Date.now(),
        });
        installBackgroundSync({ queueName: queue });
        windowClients = [fakePage("user-b", "B")];
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        await fireSync(queue);

        expect(sentAuthorizations()).not.toContain("Bearer OLD");
        expect(JSON.stringify(await readQueue(queue))).not.toContain("Bearer OLD");
    });

    it("1: re-applies the current token to a legacy entry when the page has no principal", async () => {
        const queue = nextQueue();
        await writeLegacyEntry(queue, {
            url: "https://app.test/api/legacy",
            method: "POST",
            headers: [["authorization", "Bearer OLD"]],
            body: null,
            timestamp: Date.now(),
        });
        installBackgroundSync({ queueName: queue });
        windowClients = [fakePage(null, "NOW", false)];
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        await fireSync(queue);
        expect(sentAuthorizations()).toEqual(["Bearer NOW"]);
    });

    it("2: an owner that could not be stamped fails closed instead of taking the next account's token", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        issuers = { tab: answeringClient("garbage") };
        await failOffline(postAs("A"), "tab");

        windowClients = [fakePage("user-b", "B")];
        fetchMock.mockClear();
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        await fireSync(queue);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await readQueue(queue)).toEqual([]);
    });

    it("2: an issuing tab the worker cannot find leaves the owner unknown, not unbound", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(postAs("A"), "gone");

        windowClients = [fakePage("user-b", "B")];
        fetchMock.mockClear();
        await fireSync(queue);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("2: a getPrincipal that throws answers an explicit error instead of closing the port", async () => {
        const container = new EventTarget();
        vi.stubGlobal("navigator", { serviceWorker: container });
        provideBackgroundSyncCredentials(() => null, {
            getPrincipal: () => {
                throw new Error("store not hydrated");
            },
        });
        const channel = new MessageChannel();
        const answer = new Promise<unknown>((resolve) => {
            channel.port1.onmessage = (event: MessageEvent) => resolve(event.data);
            setTimeout(() => resolve("silence"), 50);
        });
        container.dispatchEvent(
            new MessageEvent("message", {
                data: {
                    type: BACKGROUND_SYNC_CREDENTIALS_MESSAGE,
                    url: "u",
                    method: "POST",
                    phase: "enqueue",
                },
                ports: [channel.port2],
            }),
        );
        expect(await answer).toEqual({ error: true });
        channel.port1.close();
        vi.unstubAllGlobals();
    });

    it("3: finds the owner's tab even when another account's tab answers first", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        const tabA = fakePage("user-a", "A");
        issuers = { tab: tabA };
        await failOffline(postAs("A"), "tab");

        windowClients = [fakePage("user-b", "B"), tabA];
        fetchMock.mockClear();
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        await fireSync(queue);
        expect(sentAuthorizations()).toEqual(["Bearer A"]);
    });

    it("3: asks every tab in parallel under one shared deadline", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(postAs("A"));
        fetchMock.mockClear();

        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        windowClients = [{ postMessage: vi.fn() }, { postMessage: vi.fn() }];
        let drained: Promise<unknown> | undefined;
        listeners.sync[0]?.({ tag: queue, waitUntil: (p: Promise<unknown>) => (drained = p) });
        let settled = false;
        void (drained as Promise<unknown>).catch(() => undefined).then(() => (settled = true));
        await vi.waitFor(() => expect(windowClients[1]?.postMessage).toHaveBeenCalled());
        await vi.advanceTimersByTimeAsync(3000);
        await vi.waitFor(() => expect(settled).toBe(true));
    });

    it("5: concurrent triggers share one replay, so a mutation is never sent twice", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(new Request("https://app.test/api/once", { method: "POST", body: "x" }));
        fetchMock.mockClear();
        let release: (response: Response) => void = () => undefined;
        fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (release = resolve)));

        const runs: Promise<unknown>[] = [];
        for (let i = 0; i < 2; i += 1) {
            listeners.sync[0]?.({ tag: queue, waitUntil: (p: Promise<unknown>) => runs.push(p) });
        }
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
        release(new Response(null, { status: 200 }));
        await Promise.allSettled(runs);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("6: a queue cleared mid-replay stops the replay before the next send", async () => {
        const queue = nextQueue();
        const beforeReplay = vi.fn(async (request: Request) => {
            await clearBackgroundSyncQueue(queue);
            return request;
        });
        installBackgroundSync({ queueName: queue, beforeReplay });
        await failOffline(new Request("https://app.test/api/a", { method: "POST", body: "x" }));
        fetchMock.mockClear();
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        await fireSync(queue);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("6: a request that fails after the queue was cleared is not queued", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        let fail: (error: Error) => void = () => undefined;
        fetchMock.mockImplementationOnce(
            () => new Promise<Response>((_, reject) => (fail = reject)),
        );
        let produced: Promise<Response> | undefined;
        listeners.fetch[0]?.({
            request: new Request("https://app.test/api/late", { method: "POST", body: "x" }),
            respondWith: (r: Promise<Response>) => (produced = r),
            waitUntil: (p: Promise<unknown>) => extended.push(p),
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        await clearBackgroundSyncQueue(queue);
        fail(new Error("offline"));
        await produced?.catch(() => undefined);
        await Promise.all(extended);
        expect(await readQueue(queue)).toEqual([]);
    });

    it("8: keeps the entry pending when the page's answer lacks a stripped header", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(postAs("A", { "X-Api-Key": "k" }));
        windowClients = [answeringClient({ headers: { Authorization: "Bearer NOW" } })];
        fetchMock.mockClear();
        await fireSync(queue);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await readQueue(queue)).toHaveLength(1);
    });

    it("10: warns in development when no page answers for a queued credential", async () => {
        setDevBuild(true);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(postAs("A"));
        await failOffline(postAs("A"));
        await fireSync(queue);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toContain("provideBackgroundSyncCredentials");
    });
});

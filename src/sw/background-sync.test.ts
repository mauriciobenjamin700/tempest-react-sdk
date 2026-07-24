import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installBackgroundSync } from "./background-sync";

type Listener = (event: unknown) => void;

const ORIGINAL: Record<string, unknown> = {};
const STUB_KEYS = ["addEventListener", "registration", "fetch"];

let listeners: Record<string, Listener[]>;
let fetchMock: ReturnType<typeof vi.fn>;
let registerMock: ReturnType<typeof vi.fn>;

function stubSw(withSync: boolean): void {
    listeners = { fetch: [], sync: [] };
    fetchMock = vi.fn();
    registerMock = vi.fn().mockResolvedValue(undefined);

    const sw: Record<string, unknown> = {
        addEventListener: (name: string, listener: Listener) => {
            (listeners[name] ??= []).push(listener);
        },
        registration: withSync ? { sync: { register: registerMock } } : {},
        fetch: fetchMock,
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

beforeEach(() => stubSw(true));

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
    vi.restoreAllMocks();
});

function countQueue(name: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open(name, 1);
        open.onupgradeneeded = () =>
            open.result.createObjectStore("requests", { keyPath: "id", autoIncrement: true });
        open.onsuccess = () => {
            const db = open.result;
            const req = db.transaction("requests", "readonly").objectStore("requests").count();
            req.onsuccess = () => {
                resolve(req.result);
                db.close();
            };
            req.onerror = () => reject(req.error);
        };
        open.onerror = () => reject(open.error);
    });
}

async function dispatchFetch(request: Request): Promise<void> {
    let produced: Promise<Response> | undefined;
    const event = {
        request,
        respondWith: (r: Response | Promise<Response>) => {
            produced = Promise.resolve(r);
        },
        waitUntil: () => {},
    };
    listeners.fetch[0]?.(event);
    if (produced) await produced.catch(() => undefined);
}

describe("installBackgroundSync", () => {
    it("queues a failed mutation and registers a sync, then replays it", async () => {
        const queue = "test-q-replay";
        installBackgroundSync({ match: /\/api\//, queueName: queue });

        // 1. POST fails offline → queued + sync registered, original still rejects.
        fetchMock.mockRejectedValueOnce(new Error("offline"));
        await dispatchFetch(
            new Request("https://app.test/api/orders", { method: "POST", body: '{"x":1}' }),
        );
        expect(registerMock).toHaveBeenCalledWith(queue);
        expect(await countQueue(queue)).toBe(1);

        // 2. Back online: the sync event drains the queue.
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        const syncEvent = { tag: queue, waitUntil: (p: Promise<unknown>) => p };
        let drained: Promise<unknown> | undefined;
        listeners.sync[0]?.({
            ...syncEvent,
            waitUntil: (p: Promise<unknown>) => (drained = p),
        });
        await drained;
        expect(await countQueue(queue)).toBe(0);
    });

    it("ignores GET requests and non-matching URLs", async () => {
        installBackgroundSync({ match: /\/api\//, queueName: "test-q-skip" });
        fetchMock.mockRejectedValue(new Error("offline"));

        await dispatchFetch(new Request("https://app.test/api/x")); // GET
        await dispatchFetch(
            new Request("https://app.test/other", { method: "POST", body: "x" }), // non-match
        );
        expect(registerMock).not.toHaveBeenCalled();
        expect(await countQueue("test-q-skip")).toBe(0);
    });

    it("drains the queue on a matching periodicsync event", async () => {
        const queue = "test-q-periodic";
        installBackgroundSync({ queueName: queue });

        fetchMock.mockRejectedValueOnce(new Error("offline"));
        await dispatchFetch(new Request("https://app.test/api/x", { method: "POST", body: "x" }));
        expect(await countQueue(queue)).toBe(1);

        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        let drained: Promise<unknown> | undefined;
        listeners.periodicsync[0]?.({
            tag: `${queue}-periodic`,
            waitUntil: (p: Promise<unknown>) => (drained = p),
        });
        await drained;
        expect(await countQueue(queue)).toBe(0);
    });
});

describe("installBackgroundSync — replay outcomes", () => {
    /** Drive the `sync` listener and await the promise it hands to `waitUntil`. */
    async function dispatchSync(tag: string): Promise<unknown> {
        let drained: Promise<unknown> | undefined;
        listeners.sync[0]?.({ tag, waitUntil: (p: Promise<unknown>) => (drained = p) });
        return drained;
    }

    async function queueOne(): Promise<void> {
        fetchMock.mockRejectedValueOnce(new Error("offline"));
        await dispatchFetch(
            new Request("https://app.test/api/orders", { method: "POST", body: '{"x":1}' }),
        );
    }

    it("drops an entry the server rejects with a 4xx", async () => {
        const queue = "test-q-4xx";
        installBackgroundSync({ queueName: queue });
        await queueOne();

        fetchMock.mockResolvedValue(new Response(null, { status: 422 }));
        await dispatchSync(queue);
        expect(await countQueue(queue)).toBe(0);
    });

    it("keeps an entry on a 5xx and reports it as pending", async () => {
        const queue = "test-q-5xx";
        installBackgroundSync({ queueName: queue });
        await queueOne();

        fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
        await expect(dispatchSync(queue)).rejects.toThrow("1 request(s) still pending");
        expect(await countQueue(queue)).toBe(1);
    });

    it("keeps an entry when the replay fetch itself throws", async () => {
        const queue = "test-q-throw";
        installBackgroundSync({ queueName: queue });
        await queueOne();

        fetchMock.mockRejectedValue(new Error("still offline"));
        await expect(dispatchSync(queue)).rejects.toThrow("still pending");
        expect(await countQueue(queue)).toBe(1);
    });

    it("discards entries older than maxRetentionMinutes without replaying them", async () => {
        const queue = "test-q-stale";
        installBackgroundSync({ queueName: queue, maxRetentionMinutes: 0.0001 });
        await queueOne();

        await new Promise((resolve) => setTimeout(resolve, 20));
        fetchMock.mockClear();
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        await dispatchSync(queue);

        expect(await countQueue(queue)).toBe(0);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("ignores sync and periodicsync events with another tag", async () => {
        const queue = "test-q-tag";
        installBackgroundSync({ queueName: queue });
        await queueOne();

        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        expect(await dispatchSync("some-other-tag")).toBeUndefined();

        let drained: Promise<unknown> | undefined;
        listeners.periodicsync[0]?.({
            tag: "unrelated-periodic",
            waitUntil: (p: Promise<unknown>) => (drained = p),
        });
        expect(drained).toBeUndefined();
        expect(await countQueue(queue)).toBe(1);
    });

    it("swallows replay failures on periodicsync instead of rejecting", async () => {
        const queue = "test-q-periodic-fail";
        installBackgroundSync({ queueName: queue });
        await queueOne();

        fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
        let drained: Promise<unknown> | undefined;
        listeners.periodicsync[0]?.({
            tag: `${queue}-periodic`,
            waitUntil: (p: Promise<unknown>) => (drained = p),
        });
        await expect(drained).resolves.toBeUndefined();
        expect(await countQueue(queue)).toBe(1);
    });

    it("honours a custom periodicSyncTag", async () => {
        const queue = "test-q-custom-tag";
        installBackgroundSync({ queueName: queue, periodicSyncTag: "nightly" });
        await queueOne();

        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        let drained: Promise<unknown> | undefined;
        listeners.periodicsync[0]?.({
            tag: "nightly",
            waitUntil: (p: Promise<unknown>) => (drained = p),
        });
        await drained;
        expect(await countQueue(queue)).toBe(0);
    });

    it("queues a body-less mutation (DELETE) as a null body", async () => {
        const queue = "test-q-delete";
        installBackgroundSync({ queueName: queue });

        fetchMock.mockRejectedValueOnce(new Error("offline"));
        await dispatchFetch(new Request("https://app.test/api/orders/1", { method: "DELETE" }));
        expect(await countQueue(queue)).toBe(1);

        fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
        await dispatchSync(queue);
        expect(await countQueue(queue)).toBe(0);
    });

    it("ignores HEAD requests", async () => {
        installBackgroundSync({ queueName: "test-q-head" });
        fetchMock.mockRejectedValue(new Error("offline"));
        await dispatchFetch(new Request("https://app.test/api/x", { method: "HEAD" }));
        expect(await countQueue("test-q-head")).toBe(0);
    });

    it("still queues when the Background Sync API rejects registration", async () => {
        const queue = "test-q-noreg";
        registerMock.mockRejectedValueOnce(new Error("not allowed"));
        installBackgroundSync({ queueName: queue });

        fetchMock.mockRejectedValueOnce(new Error("offline"));
        await dispatchFetch(new Request("https://app.test/api/x", { method: "POST", body: "x" }));
        expect(await countQueue(queue)).toBe(1);
    });

    it("accepts a predicate for `match`", async () => {
        const queue = "test-q-predicate";
        const match = vi.fn((url: URL) => url.pathname.startsWith("/api/"));
        installBackgroundSync({ queueName: queue, match });

        fetchMock.mockRejectedValue(new Error("offline"));
        await dispatchFetch(new Request("https://app.test/nope", { method: "POST", body: "x" }));
        expect(await countQueue(queue)).toBe(0);

        await dispatchFetch(new Request("https://app.test/api/ok", { method: "POST", body: "x" }));
        expect(await countQueue(queue)).toBe(1);
        expect(match).toHaveBeenCalled();
    });
});

describe("installBackgroundSync — without the Background Sync API", () => {
    beforeEach(() => stubSw(false));

    it("drains opportunistically on a GET once the network is back", async () => {
        const queue = "test-q-fallback";
        installBackgroundSync({ queueName: queue });

        fetchMock.mockRejectedValueOnce(new Error("offline"));
        await dispatchFetch(new Request("https://app.test/api/x", { method: "POST", body: "x" }));
        expect(await countQueue(queue)).toBe(1);

        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        let drained: Promise<unknown> | undefined;
        const getEvent = {
            request: new Request("https://app.test/anything"),
            respondWith: () => {},
            waitUntil: (p: Promise<unknown>) => (drained = p),
        };
        for (const listener of listeners.fetch) listener(getEvent);
        await drained;
        expect(await countQueue(queue)).toBe(0);
    });

    it("does not drain on a non-GET request", async () => {
        installBackgroundSync({ queueName: "test-q-fallback-2" });
        let drained: Promise<unknown> | undefined;
        const postEvent = {
            request: new Request("https://app.test/api/y", { method: "PUT", body: "x" }),
            respondWith: () => {},
            waitUntil: (p: Promise<unknown>) => (drained = p),
        };
        fetchMock.mockRejectedValue(new Error("offline"));
        listeners.fetch[1]?.(postEvent);
        expect(drained).toBeUndefined();
    });
});

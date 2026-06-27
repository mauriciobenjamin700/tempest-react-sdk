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
});

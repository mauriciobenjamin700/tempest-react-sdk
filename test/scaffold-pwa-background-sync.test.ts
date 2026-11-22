/**
 * #727: what the `--pwa` scaffold's service worker queues for background sync.
 *
 * Until 0.92.0 `template-pwa/src/sw.ts` matched every mutation to this origin's
 * `/api/`. The first case below reproduces what that did to a tus upload: a
 * `PATCH` that failed offline was queued with its chunk body and its
 * `Upload-Offset`, and replayed later at that stale offset, after the upload
 * client had already resynced with `HEAD`. The rest pin the template's
 * predicate (`template-pwa/src/sw-sync-scope.ts`) through the real
 * `installBackgroundSync`, so the scaffold and the SDK are exercised together.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installBackgroundSync } from "@/sw/background-sync";
import { RETRIED_BY_THE_PAGE, queuesInTheWorker } from "../template-pwa/src/sw-sync-scope";

type Listener = (event: unknown) => void;

const ORIGIN = "https://app.test";
const STUB_KEYS = ["addEventListener", "registration", "fetch", "clients"];
const ORIGINAL: Record<string, unknown> = {};

let listeners: Record<string, Listener[]>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    listeners = { fetch: [], sync: [] };
    fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const sw: Record<string, unknown> = {
        addEventListener: (name: string, listener: Listener) => {
            (listeners[name] ??= []).push(listener);
        },
        registration: { sync: { register: vi.fn().mockResolvedValue(undefined) } },
        fetch: fetchMock,
        clients: { matchAll: async () => [], get: async () => undefined },
    };
    for (const key of STUB_KEYS) {
        ORIGINAL[key] = (globalThis as Record<string, unknown>)[key];
        Object.defineProperty(globalThis, key, {
            value: sw[key],
            configurable: true,
            writable: true,
        });
    }
});

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

interface QueuedEntry {
    url: string;
    method: string;
    headers: [string, string][] | Record<string, string>;
    body?: ArrayBuffer | string | null;
}

function readQueue(name: string): Promise<QueuedEntry[]> {
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
                resolve(req.result as QueuedEntry[]);
                db.close();
            };
            req.onerror = () => reject(req.error);
        };
        open.onerror = () => reject(open.error);
    });
}

/**
 * Dispatch a fetch event to the worker and wait for it to settle.
 *
 * @returns Whether the worker took the request over (`respondWith`); a request
 *   it does not match goes to the network untouched.
 */
async function dispatchFetch(request: Request): Promise<boolean> {
    let produced: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    listeners.fetch[0]?.({
        request,
        respondWith: (r: Response | Promise<Response>) => {
            produced = Promise.resolve(r);
        },
        waitUntil: (p: Promise<unknown>) => pending.push(p),
    });
    if (produced) await produced.catch(() => undefined);
    await Promise.all(pending);
    return produced !== undefined;
}

function tusChunk(offset: number, size: number): Request {
    return new Request(`${ORIGIN}/api/uploads/abc`, {
        method: "PATCH",
        headers: {
            "Tus-Resumable": "1.0.0",
            "Upload-Offset": String(offset),
            "Content-Type": "application/offset+octet-stream",
        },
        body: new Uint8Array(size),
    });
}

function headerOf(entry: QueuedEntry, name: string): string | undefined {
    const pairs = Array.isArray(entry.headers) ? entry.headers : Object.entries(entry.headers);
    return pairs.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

describe("--pwa background sync scope (#727)", () => {
    it("the 0.92.0 match queued a failed tus PATCH with its chunk and its stale Upload-Offset", async () => {
        const queue = "scaffold-727-before";
        installBackgroundSync({
            queueName: queue,
            match: (url) => url.origin === ORIGIN && url.pathname.startsWith("/api/"),
        });

        await dispatchFetch(tusChunk(5_242_880, 1_048_576));

        const [entry] = await readQueue(queue);
        expect(entry?.method).toBe("PATCH");
        expect(headerOf(entry!, "Upload-Offset")).toBe("5242880");
        const body = entry!.body;
        expect(typeof body === "string" ? body.length : body?.byteLength).toBe(1_048_576);
    });

    it("the scaffold leaves every tus request to the upload client", async () => {
        const queue = "scaffold-727-tus";
        installBackgroundSync({
            queueName: queue,
            match: (url, request) => queuesInTheWorker(url, request, ORIGIN),
        });

        const takenOver = await dispatchFetch(tusChunk(5_242_880, 1024));

        expect(takenOver).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await readQueue(queue)).toEqual([]);
    });

    it("the scaffold leaves a path the page retries to the page's outbox", async () => {
        const queue = "scaffold-727-outbox";
        installBackgroundSync({
            queueName: queue,
            match: (url, request) => queuesInTheWorker(url, request, ORIGIN, ["/api/visits/"]),
        });

        await dispatchFetch(
            new Request(`${ORIGIN}/api/visits/v1`, { method: "PUT", body: '{"rev":1}' }),
        );
        await dispatchFetch(new Request(`${ORIGIN}/api/orders`, { method: "POST", body: "{}" }));

        const queued = await readQueue(queue);
        expect(queued.map((entry) => entry.url)).toEqual([`${ORIGIN}/api/orders`]);
    });

    it("still queues an ordinary API mutation, and nothing from another origin or outside /api/", () => {
        const post = (url: string): boolean =>
            queuesInTheWorker(new URL(url), new Request(url, { method: "POST" }), ORIGIN);

        expect(post(`${ORIGIN}/api/orders`)).toBe(true);
        expect(post("https://other.test/api/orders")).toBe(false);
        expect(post(`${ORIGIN}/login`)).toBe(false);
    });

    it("ships with no prefix left to the page, so a fresh scaffold keeps background sync on", () => {
        expect(RETRIED_BY_THE_PAGE).toEqual([]);
    });
});

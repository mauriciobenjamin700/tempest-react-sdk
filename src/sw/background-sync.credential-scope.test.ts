/**
 * @vitest-environment-options {"url":"https://app.test/"}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDevBuild } from "../utils/dev-mode";
import { installBackgroundSync } from "./background-sync";

type Listener = (event: unknown) => void;

interface FakeClient {
    postMessage: ReturnType<typeof vi.fn>;
}

const ORIGINAL: Record<string, unknown> = {};
const STUB_KEYS = ["addEventListener", "registration", "fetch", "clients"];

let listeners: Record<string, Listener[]>;
let fetchMock: ReturnType<typeof vi.fn>;
let windowClients: FakeClient[];
let extended: Promise<unknown>[];
let queueCounter = 0;

beforeEach(() => {
    listeners = { fetch: [], sync: [] };
    fetchMock = vi.fn();
    windowClients = [];
    extended = [];
    const sw: Record<string, unknown> = {
        addEventListener: (name: string, listener: Listener) => {
            (listeners[name] ??= []).push(listener);
        },
        registration: { sync: { register: vi.fn().mockResolvedValue(undefined) } },
        fetch: fetchMock,
        clients: {
            matchAll: vi.fn(async () => windowClients),
            get: vi.fn(async () => undefined),
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
    setDevBuild(undefined);
    vi.restoreAllMocks();
});

function nextQueue(): string {
    queueCounter += 1;
    return `test-scope-q-${queueCounter}`;
}

function queueLength(name: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open(name);
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

async function failOffline(request: Request): Promise<void> {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    let produced: Promise<Response> | undefined;
    listeners.fetch[0]?.({
        request,
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

function post(url: string, headers: Record<string, string> = {}): Request {
    return new Request(url, { method: "POST", body: '{"x":1}', headers });
}

function appPage(): FakeClient {
    return {
        postMessage: vi.fn((_message: unknown, transfer: MessagePort[]) => {
            transfer[0]?.postMessage({ headers: { Authorization: "Bearer APP" } });
        }),
    };
}

function sentRequests(): Request[] {
    return fetchMock.mock.calls.slice(1).map((call) => call[0] as Request);
}

describe("installBackgroundSync — replay credentials are scoped to the worker's origin (#523)", () => {
    it("never sends the app's bearer to a foreign origin whose queued request carried its own Authorization", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(post("https://third.party/api/hooks", { Authorization: "Bearer THIRD" }));
        const page = appPage();
        windowClients = [page];
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

        await fireSync(queue);

        expect(
            sentRequests().map((request) => request.headers.get("authorization")),
            "Until #523 the worker re-applied the page's bearer for every stripped header " +
                "name without looking at the URL, so the third party received Bearer APP.",
        ).toEqual([]);
        expect(
            page.postMessage,
            "the page is not even asked for a foreign origin",
        ).not.toHaveBeenCalled();
        expect(await queueLength(queue)).toBe(0);
    });

    it("still re-applies the current bearer to a request for the worker's own origin", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(post("https://app.test/api/items", { Authorization: "Bearer OLD" }));
        windowClients = [appPage()];
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

        await fireSync(queue);

        expect(sentRequests().map((request) => request.headers.get("authorization"))).toEqual([
            "Bearer APP",
        ]);
        expect(await queueLength(queue)).toBe(0);
    });

    it("re-applies the bearer to an origin the app declared in trustedOrigins", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue, trustedOrigins: ["https://api.app.test"] });
        await failOffline(post("https://api.app.test/v1/items", { Authorization: "Bearer OLD" }));
        windowClients = [appPage()];
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

        await fireSync(queue);

        expect(sentRequests().map((request) => request.headers.get("authorization"))).toEqual([
            "Bearer APP",
        ]);
    });

    it("drops what a custom beforeReplay sends to a foreign origin with a credential header", async () => {
        const queue = nextQueue();
        const beforeReplay = vi.fn((request: Request) => {
            const headers = new Headers(request.headers);
            headers.set("Authorization", "Bearer HOOK");
            return new Request(request, { headers });
        });
        installBackgroundSync({ queueName: queue, beforeReplay });
        await failOffline(post("https://third.party/api/anon"));
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

        await fireSync(queue);

        expect(beforeReplay).toHaveBeenCalledTimes(1);
        expect(sentRequests()).toEqual([]);
        expect(await queueLength(queue)).toBe(0);
    });

    it("drops a credentialed foreign entry before a custom beforeReplay sees it", async () => {
        const queue = nextQueue();
        const beforeReplay = vi.fn((request: Request) => request);
        installBackgroundSync({ queueName: queue, beforeReplay });
        await failOffline(post("https://third.party/api/hooks", { Authorization: "Bearer THIRD" }));
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

        await fireSync(queue);

        expect(beforeReplay).not.toHaveBeenCalled();
        expect(sentRequests()).toEqual([]);
        expect(await queueLength(queue)).toBe(0);
    });

    it("leaves a foreign request that carried no credential header to the owner rules", async () => {
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue, ownerPolicy: "lenient" });
        await failOffline(post("https://third.party/api/anon"));
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

        await fireSync(queue);

        expect(sentRequests().map((request) => request.url)).toEqual([
            "https://third.party/api/anon",
        ]);
        expect(sentRequests()[0]?.headers.get("authorization")).toBeNull();
    });

    it("warns once in development, naming the origin and trustedOrigins", async () => {
        setDevBuild(true);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const queue = nextQueue();
        installBackgroundSync({ queueName: queue });
        await failOffline(post("https://third.party/api/a", { Authorization: "Bearer T" }));
        await failOffline(post("https://third.party/api/b", { Authorization: "Bearer T" }));

        await fireSync(queue);

        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toContain("https://third.party");
        expect(String(warn.mock.calls[0]?.[0])).toContain("trustedOrigins");
    });
});

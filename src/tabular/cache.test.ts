/**
 * Tests for the offline model cache.
 *
 * jsdom has no Cache Storage, so a minimal in-memory one is installed. That
 * is the point of the tests: the module's promise is "the second load works
 * with the network gone", and the only way to check it is to take the
 * network away.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    DEFAULT_MODEL_CACHE,
    cacheModelBytes,
    clearModelCache,
    fetchModelBytes,
    isModelCached,
} from "./cache";
import { ModelFetchError } from "./exceptions";

/** A minimal Cache Storage standing in for the browser's. */
class FakeCache {
    readonly entries = new Map<string, ArrayBuffer>();

    async match(url: string): Promise<Response | undefined> {
        const found = this.entries.get(url);
        return found === undefined ? undefined : new Response(found);
    }

    async put(url: string, response: Response): Promise<void> {
        this.entries.set(url, await response.arrayBuffer());
    }

    async delete(url: string): Promise<boolean> {
        return this.entries.delete(url);
    }
}

const buckets = new Map<string, FakeCache>();

const fakeCaches = {
    async open(name: string): Promise<FakeCache> {
        const existing = buckets.get(name);
        if (existing !== undefined) return existing;
        const created = new FakeCache();
        buckets.set(name, created);
        return created;
    },
    async delete(name: string): Promise<boolean> {
        return buckets.delete(name);
    },
};

const MODEL_URL = "/models/classifier-v3.onnx";
const BYTES = new Uint8Array([8, 1, 18, 4, 116, 101, 115, 116]);

beforeEach(() => {
    buckets.clear();
    Object.defineProperty(globalThis, "caches", {
        configurable: true,
        value: fakeCaches,
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "caches");
});

describe("tabular · model cache", () => {
    it("downloads once and serves the cached copy afterwards", async () => {
        const fetchMock = vi.fn(async () => new Response(BYTES));
        vi.stubGlobal("fetch", fetchMock);

        const first = await fetchModelBytes(MODEL_URL);
        const second = await fetchModelBytes(MODEL_URL);

        expect(Array.from(first)).toEqual(Array.from(BYTES));
        expect(Array.from(second)).toEqual(Array.from(BYTES));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("works with the network gone once the model is cached", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(BYTES)),
        );
        await fetchModelBytes(MODEL_URL);

        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            }),
        );
        const offline = await fetchModelBytes(MODEL_URL);
        expect(Array.from(offline)).toEqual(Array.from(BYTES));
    });

    it("says what to do when offline and never warmed", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            }),
        );
        await expect(fetchModelBytes(MODEL_URL)).rejects.toBeInstanceOf(ModelFetchError);
        await expect(fetchModelBytes(MODEL_URL)).rejects.toThrow(/not cached/);
    });

    it("names the status code when the download is refused", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("nope", { status: 404, statusText: "Not Found" })),
        );
        await expect(fetchModelBytes(MODEL_URL)).rejects.toThrow(/404/);
    });

    it("serves a stale copy rather than failing on a broken deploy", async () => {
        await cacheModelBytes(MODEL_URL, BYTES);
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("nope", { status: 500, statusText: "Boom" })),
        );
        expect(Array.from(await fetchModelBytes(MODEL_URL, { revalidate: true }))).toEqual(
            Array.from(BYTES),
        );
    });

    it("goes to the network first when asked to revalidate", async () => {
        const fetchMock = vi.fn(async () => new Response(BYTES));
        vi.stubGlobal("fetch", fetchMock);

        await fetchModelBytes(MODEL_URL);
        await fetchModelBytes(MODEL_URL, { revalidate: true });

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("reports whether a model is available offline", async () => {
        expect(await isModelCached(MODEL_URL)).toBe(false);
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(BYTES)),
        );
        await fetchModelBytes(MODEL_URL);
        expect(await isModelCached(MODEL_URL)).toBe(true);
    });

    it("stores bytes the app already has", async () => {
        expect(await cacheModelBytes(MODEL_URL, BYTES)).toBe(true);
        expect(await isModelCached(MODEL_URL)).toBe(true);

        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            }),
        );
        expect(Array.from(await fetchModelBytes(MODEL_URL))).toEqual(Array.from(BYTES));
    });

    it("evicts one model or the whole bucket", async () => {
        await cacheModelBytes(MODEL_URL, BYTES);
        expect(await clearModelCache(MODEL_URL)).toBe(true);
        expect(await isModelCached(MODEL_URL)).toBe(false);

        await cacheModelBytes(MODEL_URL, BYTES);
        expect(await clearModelCache()).toBe(true);
        expect(buckets.has(DEFAULT_MODEL_CACHE)).toBe(false);
    });

    it("names the status code without Cache Storage too", async () => {
        Reflect.deleteProperty(globalThis, "caches");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("nope", { status: 403, statusText: "Forbidden" })),
        );
        await expect(fetchModelBytes(MODEL_URL)).rejects.toThrow(/403/);
    });

    it("reports a network failure without Cache Storage", async () => {
        Reflect.deleteProperty(globalThis, "caches");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            }),
        );
        await expect(fetchModelBytes(MODEL_URL)).rejects.toBeInstanceOf(ModelFetchError);
    });

    it("still downloads where Cache Storage does not exist", async () => {
        Reflect.deleteProperty(globalThis, "caches");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(BYTES)),
        );

        expect(Array.from(await fetchModelBytes(MODEL_URL))).toEqual(Array.from(BYTES));
        expect(await isModelCached(MODEL_URL)).toBe(false);
        expect(await cacheModelBytes(MODEL_URL, BYTES)).toBe(false);
    });
});

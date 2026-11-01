/**
 * The model bytes must be the ones the manifest's `sha256` describes.
 *
 * @vitest-environment node
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ModelFetchError } from "./exceptions";
import { loadEdgePackage } from "./manifest";

/** Read a file from the dual-runtime fixture package. */
function dualFile(name: string): Uint8Array<ArrayBuffer> {
    return new Uint8Array(
        readFileSync(fileURLToPath(new URL(`./__fixtures__/dual/${name}`, import.meta.url))),
    );
}

/**
 * Serve the dual package, with the compact model replaced by `model`.
 *
 * @param model What a request for `risk.tmc` returns.
 * @returns The `fetch` stub.
 */
function serve(model: () => Uint8Array<ArrayBuffer>): ReturnType<typeof vi.fn> {
    const fetchStub = vi.fn(async (url: string) => {
        const name = url.split("/").pop() as string;
        return new Response(name === "risk.tmc" ? model() : dualFile(name));
    });
    vi.stubGlobal("fetch", fetchStub);
    return fetchStub;
}

/**
 * A Cache Storage holding one stale entry for the compact model.
 *
 * @param stale The bytes already cached under the model URL.
 * @returns The bytes stored by the last `put`, for the assertion.
 */
function staleCache(stale: Uint8Array<ArrayBuffer>): { stored: () => Uint8Array | undefined } {
    const entries = new Map<string, Uint8Array<ArrayBuffer>>([["/models/risk/risk.tmc", stale]]);
    const cache = {
        match: async (url: string) => {
            const bytes = entries.get(url);
            return bytes === undefined ? undefined : new Response(bytes);
        },
        put: async (url: string, response: Response) => {
            entries.set(url, new Uint8Array(await response.arrayBuffer()));
        },
    };
    vi.stubGlobal("caches", { open: async () => cache });
    return { stored: () => entries.get("/models/risk/risk.tmc") };
}

/** The compact model with one byte flipped after the header. */
function tampered(): Uint8Array<ArrayBuffer> {
    const bytes = dualFile("risk.tmc");
    const index = bytes.length - 1;
    bytes[index] = (bytes[index] as number) ^ 0xff;
    return bytes;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("tabular · loadEdgePackage integrity", () => {
    it("loads a model whose bytes match the manifest", async () => {
        serve(() => dualFile("risk.tmc"));
        const pkg = await loadEdgePackage("/models/risk/");
        expect(pkg.runtime).toBe("compact");
    });

    it("refuses a model that does not match the manifest's sha256", async () => {
        serve(tampered);
        const loading = loadEdgePackage("/models/risk/");
        await expect(loading).rejects.toBeInstanceOf(ModelFetchError);
        await expect(loadEdgePackage("/models/risk/")).rejects.toThrow(/does not match the sha256/);
    });

    it("replaces a stale cached model with the network copy the manifest describes", async () => {
        const cache = staleCache(tampered());
        const fetchStub = serve(() => dualFile("risk.tmc"));

        const pkg = await loadEdgePackage("/models/risk/");

        expect(pkg.runtime).toBe("compact");
        expect(fetchStub).toHaveBeenCalledWith("/models/risk/risk.tmc", undefined);
        expect(cache.stored()).toEqual(dualFile("risk.tmc"));
    });

    it("does not refetch twice when the caller already asked to revalidate", async () => {
        const fetchStub = serve(tampered);
        await expect(
            loadEdgePackage("/models/risk/", { cache: { revalidate: true } }),
        ).rejects.toBeInstanceOf(ModelFetchError);
        const modelRequests = fetchStub.mock.calls.filter(([url]) => String(url).endsWith(".tmc"));
        expect(modelRequests).toHaveLength(1);
    });
});

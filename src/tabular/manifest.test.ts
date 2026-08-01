/**
 * Tests for the edge-package reader.
 *
 * @vitest-environment node
 *
 * The fixture package under `__fixtures__/package/` was produced by
 * `tempest-fastapi-sdk`'s `edge_pipeline` — the actual writer of the format
 * this file claims to read. A hand-written manifest would only prove the two
 * halves of my own assumption agree.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ModelFetchError } from "./exceptions";
import { SUPPORTED_MANIFEST_SCHEMA, fetchEdgeManifest, loadEdgePackage } from "./manifest";
import { TabularPredictor } from "./predictor";

/** Read a file from the fixture package. */
function packageFile(name: string): Buffer {
    return readFileSync(fileURLToPath(new URL(`./__fixtures__/package/${name}`, import.meta.url)));
}

/** Serve the fixture package over a stubbed `fetch`. */
function servePackage(): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            const name = url.split("/").pop() as string;
            try {
                return new Response(new Uint8Array(packageFile(name)));
            } catch {
                return new Response("missing", { status: 404, statusText: "Not Found" });
            }
        }),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("tabular · manifest", () => {
    it("reads a manifest written by edge_pipeline", async () => {
        servePackage();
        const manifest = await fetchEdgeManifest("/models/risk/");

        expect(manifest.schema_version).toBe(SUPPORTED_MANIFEST_SCHEMA);
        expect(manifest.name).toBe("risk");
        expect(manifest.version).toBe("test-1");
        expect(manifest.verified).toBe(true);
    });

    it("carries the column order, which nothing else can check", async () => {
        servePackage();
        const manifest = await fetchEdgeManifest("/models/risk");
        expect(manifest.input.feature_names).toEqual(["age", "income", "tenure", "score"]);
        expect(manifest.input.features).toBe(4);
    });

    it("carries the classes behind each probability column", async () => {
        servePackage();
        const manifest = await fetchEdgeManifest("/models/risk/");
        expect(manifest.output.classes).toEqual(["0", "1", "2"]);
        expect(manifest.output.is_classifier).toBe(true);
    });

    it("accepts a direct URL to the manifest file", async () => {
        servePackage();
        const manifest = await fetchEdgeManifest("/models/risk/manifest.json");
        expect(manifest.name).toBe("risk");
    });

    it("refuses a schema newer than it understands", async () => {
        const manifest = JSON.parse(packageFile("manifest.json").toString()) as Record<
            string,
            unknown
        >;
        manifest.schema_version = SUPPORTED_MANIFEST_SCHEMA + 1;
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify(manifest))),
        );

        await expect(fetchEdgeManifest("/models/risk/")).rejects.toThrow(/Upgrade/);
    });

    it("rejects a document that is not a manifest", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ hello: 1 }))),
        );
        await expect(fetchEdgeManifest("/models/risk/")).rejects.toThrow(/schema_version/);
    });

    it("reports a missing manifest as a fetch failure", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("nope", { status: 404, statusText: "Not Found" })),
        );
        await expect(fetchEdgeManifest("/models/risk/")).rejects.toBeInstanceOf(ModelFetchError);
    });

    it("reports a network failure", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            }),
        );
        await expect(fetchEdgeManifest("/models/risk/")).rejects.toThrow(/Could not read/);
    });
});

describe("tabular · loadEdgePackage", () => {
    it("passes a URL straight to the runtime when caching is off", async () => {
        /**
         * In a browser ONNX Runtime fetches the URL itself. This asserts the
         * source that reaches it, rather than running it — under Node the same
         * string is read as a filesystem path.
         */
        servePackage();
        const create = vi.spyOn(TabularPredictor, "create").mockResolvedValue({
            info: {},
        } as unknown as TabularPredictor);
        await loadEdgePackage("/models/risk/", { cache: false });
        expect(create).toHaveBeenCalledWith("/models/risk/risk.onnx", expect.anything());
        create.mockRestore();
    });

    it("loads the model the manifest names and predicts", async () => {
        servePackage();
        const pkg = await loadEdgePackage("/models/risk/");

        const { labels, probabilities } = await pkg.predictor.predict([
            [-0.227505, -2.541008, 0.619261, -1.447352],
            [0.076133, -1.20832, 0.694123, -0.795562],
        ]);
        expect(labels).toEqual([2, 2]);
        expect(probabilities[0]?.[2]).toBeCloseTo(0.7484, 3);
    });

    it("exposes the names a UI needs", async () => {
        servePackage();
        const pkg = await loadEdgePackage("/models/risk/");
        expect(pkg.featureNames).toEqual(["age", "income", "tenure", "score"]);
        expect(pkg.classes).toEqual(["0", "1", "2"]);
    });

    it("maps scores onto class names, highest first", async () => {
        servePackage();
        const pkg = await loadEdgePackage("/models/risk/");
        const { probabilities } = await pkg.predictor.predict([
            [-0.227505, -2.541008, 0.619261, -1.447352],
        ]);

        const explained = pkg.explain(probabilities[0] as number[]);
        expect(explained[0]?.name).toBe("2");
        expect(explained[0]?.score).toBeGreaterThan(explained[1]?.score as number);
    });

    it("names unknown columns positionally rather than dropping them", async () => {
        const manifest = JSON.parse(packageFile("manifest.json").toString()) as Record<
            string,
            never
        >;
        (manifest.output as { classes: string[] }).classes = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) =>
                url.endsWith(".json")
                    ? new Response(JSON.stringify(manifest))
                    : new Response(new Uint8Array(packageFile("risk.onnx"))),
            ),
        );

        const pkg = await loadEdgePackage("/models/risk/");
        expect(
            pkg
                .explain([0.1, 0.9])
                .map((entry) => entry.name)
                .sort(),
        ).toEqual(["0", "1"]);
    });
});

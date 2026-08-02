/**
 * Real-browser tests for the three tabular routes.
 *
 * The claim route A rests on cannot be checked in Node: that predicting
 * with the compact reader downloads **no WebAssembly at all**. Here the
 * page's own resource timeline answers it, against the built `dist/`.
 *
 * The fixtures and the expected outputs were produced by
 * `tempest-fastapi-sdk`, so a passing run means the browser agrees with
 * scikit-learn — not with my idea of the format.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

/**
 * The page the tests run in.
 *
 * A plain harness rather than the gallery, because the ONNX route's built
 * module imports `onnxruntime-web` by name and a browser resolves that only
 * through an import map — which has to be in the document before any module
 * loads.
 */
const HARNESS = `<!doctype html><meta charset="utf-8"><title>tabular harness</title>
<script type="importmap">
{"imports": {"onnxruntime-web": "/tabular-dist/vendor/ort.bundle.min.mjs"}}
</script>
<body></body>`;

/** Serve the built tabular modules and the fixtures through the page origin. */
async function serveTabular(page: Page): Promise<void> {
    await page.route("**/tabular-harness.html", (route) => {
        route.fulfill({ status: 200, contentType: "text/html", body: HARNESS });
    });

    await page.route("**/tabular-dist/**", (route) => {
        const name = new URL(route.request().url()).pathname.split("/tabular-dist/")[1] as string;
        const vendored = name.startsWith("vendor/");
        const path = fileURLToPath(
            vendored
                ? new URL(
                      `../node_modules/onnxruntime-web/dist/${name.slice("vendor/".length)}`,
                      import.meta.url,
                  )
                : new URL(`../dist/tabular/${name}`, import.meta.url),
        );
        try {
            route.fulfill({
                status: 200,
                contentType: name.endsWith(".wasm") ? "application/wasm" : "text/javascript",
                body: readFileSync(path),
            });
        } catch {
            route.fulfill({ status: 404, body: `missing: ${name}` });
        }
    });

    await page.route("**/models/**", (route) => {
        const name = new URL(route.request().url()).pathname.split("/models/")[1] as string;
        const path = fileURLToPath(new URL(`../src/tabular/__fixtures__/${name}`, import.meta.url));
        try {
            route.fulfill({ status: 200, body: readFileSync(path) });
        } catch {
            route.fulfill({ status: 404, body: "missing" });
        }
    });
}

/** The expectations scikit-learn produced for the compact fixtures. */
const expectations = JSON.parse(
    readFileSync(
        fileURLToPath(
            new URL("../src/tabular/__fixtures__/compact/expected.json", import.meta.url),
        ),
        "utf8",
    ),
) as Record<string, { rows: number[][]; labels: string[]; probabilities?: number[][] }>;

test.beforeEach(async ({ page }) => {
    await serveTabular(page);
    await page.goto("/tabular-harness.html");
});

test("route A predicts without downloading any WebAssembly", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const { CompactPredictor } = await import("/tabular-dist/compact.js");
        const predictor = await CompactPredictor.create("/models/compact/forest.tmc");
        const output = await predictor.predict([
            [1.1, -0.6, 0.4, -0.5, 0.2],
            [-0.2, 0.5, 1.5, -1.7, 0.9],
        ]);

        const fetched = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name.split("/").pop() ?? "");

        return {
            labels: output.labels,
            wasm: fetched.filter((name) => name.endsWith(".wasm")),
            ort: fetched.filter((name) => name.includes("ort")),
            bytes: fetched.filter((name) => name.endsWith(".tmc")),
        };
    });

    expect(result.labels).toHaveLength(2);
    // The whole point of the route: no runtime crosses the network.
    expect(result.wasm).toEqual([]);
    expect(result.ort).toEqual([]);
    expect(result.bytes).toEqual(["forest.tmc"]);
});

test("route A reproduces scikit-learn in a real browser", async ({ page }) => {
    for (const [name, expectation] of Object.entries(expectations)) {
        const output = await page.evaluate(
            async ({ model, rows }) => {
                const { CompactPredictor } = await import("/tabular-dist/compact.js");
                const predictor = await CompactPredictor.create(`/models/compact/${model}.tmc`);
                const result = await predictor.predict(rows);
                return { labels: result.labels.map(String), probabilities: result.probabilities };
            },
            { model: name, rows: expectation.rows },
        );

        if (expectation.probabilities) {
            expect(output.labels, `${name} labels`).toEqual(expectation.labels);
            output.probabilities.forEach((row, index) => {
                row.forEach((value, column) => {
                    expect(value, `${name} p[${index}][${column}]`).toBeCloseTo(
                        expectation.probabilities![index]![column] as number,
                        5,
                    );
                });
            });
        } else {
            // A regressor answers with floats; string equality would compare
            // float32 formatting, not the prediction.
            output.labels.forEach((value, index) => {
                expect(Number(value), `${name} value ${index}`).toBeCloseTo(
                    Number(expectation.labels[index]),
                    2,
                );
            });
        }
    }
});

test("both routes answer the same, and the compact one loads faster", async ({ page }) => {
    // The ONNX side of the comparison pulls a 25 MB WebAssembly runtime
    // through the route handler, which is exactly the cost under test.
    test.setTimeout(180_000);
    const measured = await page.evaluate(async () => {
        const ort = await import("onnxruntime-web");
        ort.env.wasm.wasmPaths = "/tabular-dist/vendor/";
        const { loadEdgePackage } = await import("/tabular-dist/manifest.js");
        const rows = [
            [1.178408, -0.616418, -0.680701, -0.551637],
            [-0.210347, 0.500824, 1.592113, -1.745454],
            [0.494376, -2.122893, -0.611244, -0.647187],
        ];

        const compactStart = performance.now();
        const compact = await loadEdgePackage("/models/dual/", { cache: false });
        const compactLoad = performance.now() - compactStart;
        const compactOut = await compact.predictor.predict(rows);

        const onnxStart = performance.now();
        const onnx = await loadEdgePackage("/models/dual/", { cache: false, runtime: "onnx" });
        const onnxLoad = performance.now() - onnxStart;
        const onnxOut = await onnx.predictor.predict(rows);

        const time = async (fn: () => Promise<unknown>) => {
            for (let i = 0; i < 20; i += 1) await fn();
            const started = performance.now();
            for (let i = 0; i < 200; i += 1) await fn();
            return (performance.now() - started) / 200;
        };

        return {
            runtimes: [compact.runtime, onnx.runtime],
            compactLabels: compactOut.labels,
            onnxLabels: onnxOut.labels,
            compactLoadMs: compactLoad,
            onnxLoadMs: onnxLoad,
            compactPredictMs: await time(() => compact.predictor.predict(rows)),
            onnxPredictMs: await time(() => onnx.predictor.predict(rows)),
        };
    });

    expect(measured.runtimes).toEqual(["compact", "onnx"]);
    // Same model, two readers: the answers must not depend on which one ran.
    expect(measured.compactLabels).toEqual(measured.onnxLabels);
    expect(measured.compactLoadMs).toBeLessThan(measured.onnxLoadMs);

    console.log(
        `compact: load ${measured.compactLoadMs.toFixed(1)}ms predict ` +
            `${measured.compactPredictMs.toFixed(4)}ms | onnx: load ` +
            `${measured.onnxLoadMs.toFixed(1)}ms predict ${measured.onnxPredictMs.toFixed(4)}ms`,
    );
});

test("route B loads a model in ORT format", async ({ page }) => {
    test.setTimeout(180_000);
    const info = await page.evaluate(async () => {
        const ort = await import("onnxruntime-web");
        ort.env.wasm.wasmPaths = "/tabular-dist/vendor/";
        const { TabularPredictor } = await import("/tabular-dist/predictor.js");
        const predictor = await TabularPredictor.create("/models/classifier.ort");
        const result = await predictor.predict([
            [-0.227505, -2.541008, 0.619261, -1.447352],
            [0.076133, -1.20832, 0.694123, -0.795562],
        ]);
        return { features: predictor.info.numFeatures, labels: result.labels };
    });

    expect(info.features).toBe(4);
    expect(info.labels).toEqual([2, 2]);
});

test("the compact route works with the network gone", async ({ page }) => {
    const offline = await page.evaluate(async () => {
        const { fetchModelBytes } = await import("/tabular-dist/cache.js");
        const { CompactPredictor } = await import("/tabular-dist/compact.js");

        await fetchModelBytes("/models/compact/forest.tmc");

        const realFetch = window.fetch;
        window.fetch = (async () => {
            throw new TypeError("Failed to fetch");
        }) as typeof fetch;
        try {
            const bytes = await fetchModelBytes("/models/compact/forest.tmc");
            const predictor = await CompactPredictor.create(bytes);
            const result = await predictor.predict([[1.1, -0.6, 0.4, -0.5, 0.2]]);
            return { ok: true, labels: result.labels };
        } finally {
            window.fetch = realFetch;
        }
    });

    expect(offline.ok).toBe(true);
    expect(offline.labels).toHaveLength(1);
});

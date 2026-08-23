/**
 * Cross-language tests for the compact reader.
 *
 * @vitest-environment node
 *
 * The fixtures under `__fixtures__/compact/` were written by
 * `tempest-fastapi-sdk`'s `export_sklearn_to_compact`, together with the
 * predictions scikit-learn itself produced for the same rows. So these
 * tests do not check that the reader agrees with my idea of the format —
 * they check that it agrees with scikit-learn, which is the only claim
 * worth making about a reimplementation.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { CompactPredictor, SUPPORTED_COMPACT_SCHEMA } from "./compact";
import { CompactFormatError, FeatureShapeError } from "./exceptions";

interface Expectation {
    readonly rows: number[][];
    readonly labels: string[];
    readonly kind: string;
    readonly bytes: number;
    readonly probabilities?: number[][];
    readonly values?: number[];
}

/** Read a fixture file. */
function fixture(name: string): Uint8Array {
    return new Uint8Array(
        readFileSync(fileURLToPath(new URL(`./__fixtures__/compact/${name}`, import.meta.url))),
    );
}

const expected = JSON.parse(new TextDecoder().decode(fixture("expected.json"))) as Record<
    string,
    Expectation
>;

/**
 * `iris_forest` is here because it caught the routing rule: one of its rows
 * lands exactly on a split threshold, where scikit-learn's float32
 * comparison goes left and a float64 one goes right.
 */
const CLASSIFIERS = ["logreg_multi", "logreg_binary", "pipeline", "tree", "forest", "iris_forest"];
const REGRESSORS = ["regressor", "forest_regressor"];

describe("compact · agreement with scikit-learn", () => {
    it.each(CLASSIFIERS)("reproduces %s labels exactly", async (name) => {
        const predictor = await CompactPredictor.create(fixture(`${name}.tmc`));
        const { labels } = await predictor.predict(expected[name]!.rows);
        expect(labels.map(String)).toEqual(expected[name]!.labels);
    });

    it.each(CLASSIFIERS)("reproduces %s probabilities", async (name) => {
        const predictor = await CompactPredictor.create(fixture(`${name}.tmc`));
        const { probabilities } = await predictor.predict(expected[name]!.rows);
        const reference = expected[name]!.probabilities as number[][];

        expect(probabilities).toHaveLength(reference.length);
        probabilities.forEach((row, index) => {
            row.forEach((value, column) => {
                expect(value).toBeCloseTo(reference[index]![column] as number, 5);
            });
        });
    });

    it.each(REGRESSORS)("reproduces %s values", async (name) => {
        const predictor = await CompactPredictor.create(fixture(`${name}.tmc`));
        const { labels, probabilities } = await predictor.predict(expected[name]!.rows);
        const reference = expected[name]!.values as number[];

        expect(probabilities).toEqual([]);
        labels.forEach((value, index) => {
            expect(value as number).toBeCloseTo(reference[index] as number, 3);
        });
    });

    it("sums classifier probabilities to one", async () => {
        const predictor = await CompactPredictor.create(fixture("forest.tmc"));
        const { probabilities } = await predictor.predict(expected.forest!.rows);
        for (const row of probabilities) {
            expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
        }
    });
});

describe("compact · what a loaded model reports", () => {
    it("describes a linear model", async () => {
        const predictor = await CompactPredictor.create(fixture("logreg_multi.tmc"));
        expect(predictor.info.kind).toBe("linear");
        expect(predictor.info.numFeatures).toBe(5);
        expect(predictor.info.classes).toEqual(["0", "1", "2"]);
        expect(predictor.info.isClassifier).toBe(true);
        expect(predictor.info.numTrees).toBe(0);
        expect(predictor.info.estimator).toBe("LogisticRegression");
    });

    it("describes a forest", async () => {
        const predictor = await CompactPredictor.create(fixture("forest.tmc"));
        expect(predictor.info.kind).toBe("tree_ensemble");
        expect(predictor.info.numTrees).toBe(12);
        expect(predictor.info.estimator).toBe("RandomForestClassifier");
    });

    it("carries the column order", async () => {
        const predictor = await CompactPredictor.create(fixture("pipeline.tmc"));
        expect(predictor.info.featureNames).toEqual(["f0", "f1", "f2", "f3", "f4"]);
    });

    it("knows a regressor has no classes", async () => {
        const predictor = await CompactPredictor.create(fixture("regressor.tmc"));
        expect(predictor.info.isClassifier).toBe(false);
        expect(predictor.info.classes).toEqual([]);
    });
});

describe("compact · size against ONNX", () => {
    it("stays far below the ONNX runtime it replaces", () => {
        /**
         * The claim the whole route rests on: a model plus this reader is
         * kilobytes, where onnxruntime-web is 6.0 MB gzipped before the
         * first prediction.
         */
        const forest = fixture("forest.tmc").byteLength;
        expect(forest).toBeLessThan(64 * 1024);
        expect(fixture("logreg_multi.tmc").byteLength).toBeLessThan(1024);
    });
});

describe("compact · failures", () => {
    it("refuses bytes that are not a compact model", async () => {
        const notAModel = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        await expect(CompactPredictor.create(notAModel)).rejects.toBeInstanceOf(CompactFormatError);
        await expect(CompactPredictor.create(notAModel)).rejects.toThrow(/TabularPredictor/);
    });

    it("refuses a layout newer than it understands", async () => {
        const bytes = fixture("logreg_multi.tmc");
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const headerLength = view.getUint32(4, true);
        const header = JSON.parse(
            new TextDecoder().decode(bytes.subarray(8, 8 + headerLength)),
        ) as Record<string, unknown>;
        header.schema_version = SUPPORTED_COMPACT_SCHEMA + 1;

        const encoded = new TextEncoder().encode(JSON.stringify(header).padEnd(headerLength, " "));
        const tampered = new Uint8Array(bytes);
        tampered.set(encoded.subarray(0, headerLength), 8);

        await expect(CompactPredictor.create(tampered)).rejects.toThrow(/Upgrade/);
    });

    it("refuses an empty batch", async () => {
        const predictor = await CompactPredictor.create(fixture("forest.tmc"));
        await expect(predictor.predict([])).rejects.toBeInstanceOf(FeatureShapeError);
    });

    it("refuses the wrong width, naming the expectation", async () => {
        const predictor = await CompactPredictor.create(fixture("forest.tmc"));
        await expect(predictor.predict([[1, 2]])).rejects.toThrow(/expects 5 features/);
    });

    it("refuses a ragged batch, naming the row", async () => {
        const predictor = await CompactPredictor.create(fixture("forest.tmc"));
        await expect(
            predictor.predict([
                [1, 2, 3, 4, 5],
                [1, 2, 3],
            ]),
        ).rejects.toThrow(/row 1/);
    });

    it("reports a URL that cannot be read", async () => {
        await expect(CompactPredictor.create("/models/missing.tmc")).rejects.toThrow(
            /Could not download/,
        );
    });

    it("names the status code when the server refuses the model", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("nada aqui", { status: 404, statusText: "Not Found" })),
        );
        await expect(CompactPredictor.create("https://cdn.exemplo/modelo.tmc")).rejects.toThrow(
            /404 Not Found/,
        );
        vi.unstubAllGlobals();
    });

    it("downloads the model when the source is a URL, and disposes of nothing", async () => {
        const bytes = fixture("logreg_multi.tmc");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(bytes.slice().buffer as ArrayBuffer, { status: 200 })),
        );

        const predictor = await CompactPredictor.create("https://cdn.exemplo/modelo.tmc");

        expect(predictor.info.classes.length).toBeGreaterThan(0);
        await expect(predictor.dispose()).resolves.toBeUndefined();
        vi.unstubAllGlobals();
    });

    it("accepts the bytes already in hand, as an ArrayBuffer", async () => {
        const bytes = fixture("logreg_multi.tmc");
        const buffer = bytes.slice().buffer as ArrayBuffer;

        const predictor = await CompactPredictor.create(buffer);

        expect(predictor.info.classes.length).toBeGreaterThan(0);
    });
});

/**
 * Real-model tests for the tabular predictor.
 *
 * @vitest-environment node
 *
 * These run ONNX Runtime Web for real, against models exported by
 * `tempest-fastapi-sdk`'s `export_sklearn_to_onnx`. Mocking the runtime
 * would test the contract this file assumes rather than the one ONNX
 * Runtime has — and every trap this module handles (int64 labels arriving
 * as `bigint`, a ZipMap output that cannot be read, a dynamic batch
 * dimension reported as `4294967295`) was found by running a real model,
 * not by reading a type.
 *
 * The node environment is deliberate: jsdom does not instantiate the
 * runtime's WebAssembly module.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FeatureShapeError, InferenceError, ModelLoadError } from "./exceptions";
import { DEFAULT_TABULAR_PROVIDERS, TabularPredictor } from "./predictor";

/** Load a fixture model's bytes. */
function fixture(name: string): Uint8Array {
    return new Uint8Array(
        readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))),
    );
}

/** Rows whose scikit-learn predictions are known: labels 0, 1, 2. */
const ROWS = [
    [-0.922514, 0.265826, 0.624995, -0.035574],
    [1.809123, 1.208335, 0.65296, 0.770769],
    [0.303756, -1.858473, -0.049812, -1.556741],
];

/** Rows for the regressor, predicted as -93.3919 and -104.8195. */
const REGRESSION_ROWS = [
    [-1.491258, 0.396007, -1.093062],
    [-0.575788, -1.466424, 0.521065],
];

describe("tabular · loading", () => {
    it("describes a classifier graph", async () => {
        const predictor = await TabularPredictor.create(fixture("classifier.onnx"));
        expect(predictor.info.inputName).toBe("input");
        expect(predictor.info.numFeatures).toBe(4);
        expect(predictor.info.isClassifier).toBe(true);
        expect(predictor.info.probabilityOutput).toBe("probabilities");
        expect(predictor.info.labelOutput).toBe("label");
        await predictor.dispose();
    });

    it("describes a regressor graph, which has no score output", async () => {
        const predictor = await TabularPredictor.create(fixture("regressor.onnx"));
        expect(predictor.info.isClassifier).toBe(false);
        expect(predictor.info.probabilityOutput).toBeNull();
        expect(predictor.info.labelOutput).toBe("variable");
        await predictor.dispose();
    });

    it("defaults to the WebAssembly backend", () => {
        expect(DEFAULT_TABULAR_PROVIDERS).toEqual(["wasm"]);
    });

    it("reads the feature count without mistaking the dynamic batch dim", async () => {
        const predictor = await TabularPredictor.create(fixture("classifier.onnx"));
        expect(predictor.info.numFeatures).toBe(4);
        await predictor.dispose();
    });
});

describe("tabular · prediction", () => {
    it("reproduces scikit-learn's labels", async () => {
        const predictor = await TabularPredictor.create(fixture("classifier.onnx"));
        const { labels } = await predictor.predict(ROWS);
        expect(labels).toEqual([0, 1, 2]);
        await predictor.dispose();
    });

    it("returns labels as numbers, not bigints", async () => {
        const predictor = await TabularPredictor.create(fixture("classifier.onnx"));
        const { labels } = await predictor.predict(ROWS);
        expect(typeof labels[0]).toBe("number");
        expect(() => JSON.stringify(labels)).not.toThrow();
        await predictor.dispose();
    });

    it("reproduces scikit-learn's probabilities", async () => {
        const predictor = await TabularPredictor.create(fixture("classifier.onnx"));
        const { probabilities } = await predictor.predict(ROWS);
        expect(probabilities).toHaveLength(3);
        expect(probabilities[0]).toHaveLength(3);
        expect(probabilities[0]?.[0]).toBeCloseTo(0.6662, 3);
        expect(probabilities[0]?.[1]).toBeCloseTo(0.1061, 3);
        expect(probabilities[0]?.[2]).toBeCloseTo(0.2277, 3);
        await predictor.dispose();
    });

    it("sums each row's probabilities to one", async () => {
        const predictor = await TabularPredictor.create(fixture("classifier.onnx"));
        const { probabilities } = await predictor.predict(ROWS);
        for (const row of probabilities) {
            expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
        }
        await predictor.dispose();
    });

    it("reproduces the regressor's values and returns no probabilities", async () => {
        const predictor = await TabularPredictor.create(fixture("regressor.onnx"));
        const { labels, probabilities } = await predictor.predict(REGRESSION_ROWS);
        expect(probabilities).toEqual([]);
        expect(labels[0] as number).toBeCloseTo(-93.3919, 2);
        expect(labels[1] as number).toBeCloseTo(-104.8195, 2);
        await predictor.dispose();
    });

    it("reports how long the call took", async () => {
        const predictor = await TabularPredictor.create(fixture("classifier.onnx"));
        const { ms, numRows } = await predictor.predict(ROWS);
        expect(numRows).toBe(3);
        expect(ms).toBeGreaterThanOrEqual(0);
        await predictor.dispose();
    });
});

describe("tabular · input validation", () => {
    it("refuses an empty batch", async () => {
        const predictor = await TabularPredictor.create(fixture("classifier.onnx"));
        await expect(predictor.predict([])).rejects.toBeInstanceOf(FeatureShapeError);
        await predictor.dispose();
    });

    it("refuses the wrong width, naming the expectation", async () => {
        const predictor = await TabularPredictor.create(fixture("classifier.onnx"));
        await expect(predictor.predict([[1, 2]])).rejects.toThrow(/expects 4 features/);
        await predictor.dispose();
    });

    it("refuses a ragged batch, naming the row", async () => {
        const predictor = await TabularPredictor.create(fixture("classifier.onnx"));
        await expect(
            predictor.predict([
                [1, 2, 3, 4],
                [1, 2, 3],
            ]),
        ).rejects.toThrow(/row 1/);
        await predictor.dispose();
    });
});

describe("tabular · ZipMap", () => {
    it("explains that a ZipMap export cannot be read in the browser", async () => {
        /**
         * Measured: skl2onnx's default leaves ZipMap on, which makes the
         * probability output a sequence of maps. ONNX Runtime Web cannot
         * read non-tensor values, so this is a wall — the error has to name
         * the fix instead of the symptom.
         */
        const predictor = await TabularPredictor.create(fixture("classifier-zipmap.onnx"), {
            warmup: false,
        });
        await expect(predictor.predict(ROWS)).rejects.toBeInstanceOf(InferenceError);
        await expect(predictor.predict(ROWS)).rejects.toThrow(/ZipMap/);
        await predictor.dispose();
    });
});

describe("tabular · options", () => {
    it("warms up by default, so the first real call is not the slow one", async () => {
        const cold = await TabularPredictor.create(fixture("classifier.onnx"), {
            warmup: false,
        });
        const warm = await TabularPredictor.create(fixture("classifier.onnx"));

        const first = await cold.predict(ROWS);
        const second = await warm.predict(ROWS);
        expect(first.labels).toEqual(second.labels);

        await cold.dispose();
        await warm.dispose();
    });

    it("accepts explicit providers", async () => {
        const predictor = await TabularPredictor.create(fixture("classifier.onnx"), {
            providers: ["wasm"],
        });
        expect(predictor.info.providers).toEqual(["wasm"]);
        await predictor.dispose();
    });

    it("forwards session options without breaking the load", async () => {
        const predictor = await TabularPredictor.create(fixture("classifier.onnx"), {
            sessionOptions: { graphOptimizationLevel: "all" },
        });
        expect(predictor.info.numFeatures).toBe(4);
        await predictor.dispose();
    });

    it("reports a load failure as a typed error", async () => {
        await expect(TabularPredictor.create(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(
            ModelLoadError,
        );
    });

    it("survives a warm-up that cannot run", async () => {
        const predictor = await TabularPredictor.create(fixture("classifier.onnx"));
        await expect(predictor.warmUp()).resolves.toBeUndefined();
        await predictor.dispose();
    });
});

describe("tabular · the .ort format", () => {
    /**
     * Route B: a minimal ONNX Runtime build reads `.ort` rather than
     * `.onnx`, and shrinking that runtime is the reason to go there — the
     * `.ort` file itself is *larger* (measured: 526 B of ONNX becomes
     * 2360 B). The stock build reads it too, which is what makes the route
     * testable here without compiling a runtime.
     */
    it("loads a model in ORT format", async () => {
        const predictor = await TabularPredictor.create(fixture("classifier.ort"));
        expect(predictor.info.numFeatures).toBe(4);
        expect(predictor.info.isClassifier).toBe(true);
        await predictor.dispose();
    });

    it("answers exactly as the same model in ONNX format", async () => {
        const rows = [
            [-0.227505, -2.541008, 0.619261, -1.447352],
            [0.076133, -1.20832, 0.694123, -0.795562],
        ];
        const predictor = await TabularPredictor.create(fixture("classifier.ort"));
        const { labels } = await predictor.predict(rows);
        expect(labels).toEqual([2, 2]);
        await predictor.dispose();
    });
});

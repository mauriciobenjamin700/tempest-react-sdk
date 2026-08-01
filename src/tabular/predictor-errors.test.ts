/**
 * Branch coverage for the parts a real model cannot reach.
 *
 * The runtime is mocked here on purpose: a graph with string labels, a
 * WebGPU build without `ai.onnx.ml` kernels, and a session that reports no
 * input metadata are all real situations, and none of them can be produced
 * from a `.onnx` fixture running in Node. `predictor.test.ts` covers the
 * contract against real models; this file covers the translation of failures.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state: {
    createError: Error | null;
    runError: Error | null;
    outputs: Record<string, { data: ArrayLike<unknown> } | undefined>;
    outputNames: string[];
    inputMetadata: unknown;
    release: (() => Promise<void>) | undefined;
} = {
    createError: null,
    runError: null,
    outputs: {},
    outputNames: ["label", "probabilities"],
    inputMetadata: [{ name: "input", isTensor: true, type: "float32", shape: [-1, 2] }],
    release: undefined,
};

vi.mock("onnxruntime-web", () => ({
    InferenceSession: {
        create: async () => {
            if (state.createError !== null) throw state.createError;
            return {
                inputNames: ["input"],
                outputNames: state.outputNames,
                inputMetadata: state.inputMetadata,
                run: async () => {
                    if (state.runError !== null) throw state.runError;
                    return state.outputs;
                },
                release: state.release,
            };
        },
    },
    Tensor: class {
        constructor(
            public type: string,
            public data: Float32Array,
            public dims: number[],
        ) {}
    },
    env: { wasm: { wasmPaths: undefined } },
}));

const { TabularPredictor } = await import("./predictor");
const { InferenceError, ModelLoadError, UnsupportedGraphError } = await import("./exceptions");

beforeEach(() => {
    state.createError = null;
    state.runError = null;
    state.outputNames = ["label", "probabilities"];
    state.inputMetadata = [{ name: "input", isTensor: true, type: "float32", shape: [-1, 2] }];
    state.release = async () => undefined;
    state.outputs = {
        label: { data: new BigInt64Array([1n]) },
        probabilities: { data: new Float32Array([0.3, 0.7]) },
    };
});

describe("tabular · failure translation", () => {
    it("names the WebGPU import when the ml operators are missing", async () => {
        state.createError = new Error(
            "Can't create a session. ERROR_CODE: 6, ERROR_MESSAGE: No Op registered " +
                "for TreeEnsembleClassifier with domain_version of 1",
        );
        const failure = await TabularPredictor.create(new Uint8Array([1])).catch(
            (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(UnsupportedGraphError);
        expect((failure as Error).message).toMatch(/onnxruntime-web\/webgpu/);
        expect((failure as Error).message).toMatch(/ai\.onnx\.ml/);
    });

    it("wraps any other load failure", async () => {
        state.createError = new Error("disk on fire");
        await expect(TabularPredictor.create(new Uint8Array([1]))).rejects.toBeInstanceOf(
            ModelLoadError,
        );
    });

    it("wraps a non-Error thrown by the runtime", async () => {
        state.createError = "just a string" as unknown as Error;
        await expect(TabularPredictor.create(new Uint8Array([1]))).rejects.toThrow(/just a string/);
    });

    it("explains a ZipMap output from the run failure alone", async () => {
        const predictor = await TabularPredictor.create(new Uint8Array([1]));
        state.runError = new Error("Reading data from non-tensor typed value is not supported.");
        await expect(predictor.predict([[1, 2]])).rejects.toThrow(/ZipMap/);
    });

    it("wraps any other run failure", async () => {
        const predictor = await TabularPredictor.create(new Uint8Array([1]));
        state.runError = new Error("out of memory");
        const failure = await predictor.predict([[1, 2]]).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(InferenceError);
        expect((failure as Error).message).toMatch(/out of memory/);
    });

    it("reports a missing label output rather than returning nothing", async () => {
        const predictor = await TabularPredictor.create(new Uint8Array([1]));
        state.outputs = { probabilities: { data: new Float32Array([0.3, 0.7]) } };
        await expect(predictor.predict([[1, 2]])).rejects.toBeInstanceOf(InferenceError);
    });
});

describe("tabular · graph shapes", () => {
    it("keeps string class labels as strings", async () => {
        const predictor = await TabularPredictor.create(new Uint8Array([1]));
        state.outputs = {
            label: { data: ["spam"] },
            probabilities: { data: new Float32Array([0.1, 0.9]) },
        };
        const { labels } = await predictor.predict([[1, 2]]);
        expect(labels).toEqual(["spam"]);
    });

    it("keeps float labels as numbers", async () => {
        const predictor = await TabularPredictor.create(new Uint8Array([1]));
        state.outputNames = ["variable"];
        state.outputs = { variable: { data: new Float32Array([1.5]) } };
        const fresh = await TabularPredictor.create(new Uint8Array([1]));
        const { labels, probabilities } = await fresh.predict([[1, 2]]);
        expect(labels).toEqual([1.5]);
        expect(probabilities).toEqual([]);
        await predictor.dispose();
    });

    it("skips warm-up when the graph declares no feature count", async () => {
        state.inputMetadata = [{ name: "input", isTensor: false }];
        const predictor = await TabularPredictor.create(new Uint8Array([1]));
        expect(predictor.info.numFeatures).toBeNull();
    });

    it("ignores a symbolic feature dimension", async () => {
        state.inputMetadata = [
            { name: "input", isTensor: true, type: "float32", shape: [-1, "features"] },
        ];
        const predictor = await TabularPredictor.create(new Uint8Array([1]));
        expect(predictor.info.numFeatures).toBeNull();
    });

    it("ignores an unsigned -1 masquerading as a feature count", async () => {
        state.inputMetadata = [
            { name: "input", isTensor: true, type: "float32", shape: [-1, 4294967295] },
        ];
        const predictor = await TabularPredictor.create(new Uint8Array([1]));
        expect(predictor.info.numFeatures).toBeNull();
    });

    it("accepts any width when the graph declares none", async () => {
        state.inputMetadata = undefined;
        const predictor = await TabularPredictor.create(new Uint8Array([1]));
        const { numRows } = await predictor.predict([[1, 2, 3, 4, 5]]);
        expect(numRows).toBe(1);
    });

    it("falls back to the first output when no name looks like a label", async () => {
        state.outputNames = ["mystery"];
        state.outputs = { mystery: { data: new Float32Array([7]) } };
        const predictor = await TabularPredictor.create(new Uint8Array([1]));
        expect(predictor.info.labelOutput).toBe("mystery");
        expect((await predictor.predict([[1, 2]])).labels).toEqual([7]);
    });

    it("disposes a session that has no release method", async () => {
        state.release = undefined;
        const predictor = await TabularPredictor.create(new Uint8Array([1]));
        await expect(predictor.dispose()).resolves.toBeUndefined();
    });
});

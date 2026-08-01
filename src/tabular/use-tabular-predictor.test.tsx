/**
 * Tests for the React binding.
 *
 * ONNX Runtime is mocked here — what is under test is the lifecycle
 * (loading, cancellation, disposal, gating) rather than inference, which
 * `predictor.test.ts` covers against real models.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runMock = vi.fn(async () => ({
    label: { data: new BigInt64Array([1n]) },
    probabilities: { data: new Float32Array([0.2, 0.8]) },
}));
const releaseMock = vi.fn(async () => undefined);
const createMock = vi.fn(async () => ({
    inputNames: ["input"],
    outputNames: ["label", "probabilities"],
    inputMetadata: [{ name: "input", isTensor: true, type: "float32", shape: [-1, 2] }],
    run: runMock,
    release: releaseMock,
}));

vi.mock("onnxruntime-web", () => ({
    InferenceSession: { create: (...args: unknown[]) => createMock(...(args as [])) },
    Tensor: class {
        constructor(
            public type: string,
            public data: Float32Array,
            public dims: number[],
        ) {}
    },
    env: { wasm: { wasmPaths: undefined } },
}));

const { useTabularPredictor } = await import("./use-tabular-predictor");

const MODEL_BYTES = new Uint8Array([1, 2, 3]);

beforeEach(() => {
    createMock.mockClear();
    runMock.mockClear();
    releaseMock.mockClear();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("tabular · useTabularPredictor", () => {
    it("loads the model and becomes ready", async () => {
        const { result } = renderHook(() => useTabularPredictor(MODEL_BYTES));
        expect(result.current.status).toBe("loading");
        await waitFor(() => expect(result.current.isReady).toBe(true));
        expect(result.current.predictor).not.toBeNull();
        expect(result.current.error).toBeNull();
    });

    it("stays idle while the source is null", async () => {
        const { result } = renderHook(() => useTabularPredictor(null));
        expect(result.current.status).toBe("idle");
        expect(createMock).not.toHaveBeenCalled();
    });

    it("predicts once ready, converting bigint labels", async () => {
        const { result } = renderHook(() => useTabularPredictor(MODEL_BYTES));
        await waitFor(() => expect(result.current.isReady).toBe(true));

        const prediction = await act(async () => await result.current.predict([[1, 2]]));
        expect(prediction.labels).toEqual([1]);
        expect(prediction.probabilities[0]?.[0]).toBeCloseTo(0.2, 6);
        expect(prediction.probabilities[0]?.[1]).toBeCloseTo(0.8, 6);
    });

    it("refuses to predict before the model is ready", async () => {
        const { result } = renderHook(() => useTabularPredictor(MODEL_BYTES));
        await expect(result.current.predict([[1, 2]])).rejects.toThrow(/isReady/);
    });

    it("surfaces a load failure without leaving a stale predictor", async () => {
        createMock.mockRejectedValueOnce(new Error("boom"));
        const { result } = renderHook(() => useTabularPredictor(MODEL_BYTES));
        await waitFor(() => expect(result.current.status).toBe("error"));
        expect(result.current.predictor).toBeNull();
        expect(result.current.error?.message).toMatch(/boom/);
    });

    it("retries on reload", async () => {
        createMock.mockRejectedValueOnce(new Error("boom"));
        const { result } = renderHook(() => useTabularPredictor(MODEL_BYTES));
        await waitFor(() => expect(result.current.status).toBe("error"));

        act(() => result.current.reload());
        await waitFor(() => expect(result.current.isReady).toBe(true));
        expect(createMock).toHaveBeenCalledTimes(2);
    });

    it("releases the session on unmount", async () => {
        const { result, unmount } = renderHook(() => useTabularPredictor(MODEL_BYTES));
        await waitFor(() => expect(result.current.isReady).toBe(true));
        unmount();
        await waitFor(() => expect(releaseMock).toHaveBeenCalled());
    });

    it("fetches through the cache when given a URL", async () => {
        const fetchMock = vi.fn(async () => new Response(MODEL_BYTES));
        vi.stubGlobal("fetch", fetchMock);

        const { result } = renderHook(() => useTabularPredictor("/models/m.onnx"));
        await waitFor(() => expect(result.current.isReady).toBe(true));
        expect(fetchMock).toHaveBeenCalledWith("/models/m.onnx", undefined);
    });

    it("skips the cache when told to", async () => {
        const fetchMock = vi.fn(async () => new Response(MODEL_BYTES));
        vi.stubGlobal("fetch", fetchMock);

        const { result } = renderHook(() =>
            useTabularPredictor("/models/m.onnx", { cache: false }),
        );
        await waitFor(() => expect(result.current.isReady).toBe(true));
        expect(fetchMock).not.toHaveBeenCalled();
        expect(createMock).toHaveBeenCalledWith("/models/m.onnx", expect.anything());
    });
});

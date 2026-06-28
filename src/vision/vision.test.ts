import { describe, expect, it } from "vitest";
import { COCO_CLASSES, resolveLabels, softmax, topK } from "./index";

describe("vision · softmax", () => {
    it("produces a probability distribution that sums to 1", () => {
        const out = softmax([1, 2, 3]);
        const sum = out.reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 5);
        // monotonic: larger logit → larger probability
        expect(out[2]).toBeGreaterThan(out[1] as number);
        expect(out[1]).toBeGreaterThan(out[0] as number);
    });
});

describe("vision · topK", () => {
    it("returns the k highest values sorted descending with their indices", () => {
        const probs = new Float32Array([0.1, 0.5, 0.2, 0.05, 0.15]);
        const { indices, values } = topK(probs, 2);
        expect([...indices]).toEqual([1, 2]);
        expect(values[0]).toBeCloseTo(0.5);
        expect(values[1]).toBeCloseTo(0.2);
    });

    it("k=null returns all entries", () => {
        const { indices } = topK(new Float32Array([0.3, 0.7]), null);
        expect(indices.length).toBe(2);
    });
});

describe("vision · resolveLabels", () => {
    it("resolves the coco preset (80 classes)", () => {
        const labels = resolveLabels("coco");
        expect(labels.length).toBe(COCO_CLASSES.length);
        expect(labels[0]).toBe(COCO_CLASSES[0]);
    });

    it("passes an explicit array through", () => {
        expect(resolveLabels(["cat", "dog"])).toEqual(["cat", "dog"]);
    });

    it("auto-generates class_N from numClasses", () => {
        expect(resolveLabels(null, { numClasses: 3 })).toEqual(["class_0", "class_1", "class_2"]);
    });

    it("throws when array length disagrees with numClasses", () => {
        expect(() => resolveLabels(["a", "b"], { numClasses: 3 })).toThrow();
    });
});

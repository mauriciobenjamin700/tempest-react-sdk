import { describe, expect, it } from "vitest";
import { Probs } from "@/vision/results";

/**
 * The full-sort selection `Probs` used before partial selection replaced it.
 *
 * Kept here as the oracle: the fast path has to agree with it on every input,
 * ties included, or the optimisation changed an answer instead of the cost.
 *
 * @param data - Per-class probabilities.
 * @param k - How many classes to select.
 * @returns Indices and values, descending by value.
 */
function fullSortTopK(data: Float32Array, k: number): { indices: number[]; values: number[] } {
    const n = Math.min(k, data.length);
    const order: number[] = [];
    for (let i = 0; i < data.length; i++) order.push(i);
    order.sort((a, b) => (data[b] as number) - (data[a] as number));
    return {
        indices: order.slice(0, n),
        values: order.slice(0, n).map((index) => data[index] as number),
    };
}

describe("Probs", () => {
    it("reports the most probable class and its probability", () => {
        const probs = new Probs(Float32Array.from([0.1, 0.7, 0.2]));
        expect(probs.top1).toBe(1);
        expect(probs.top1conf).toBeCloseTo(0.7, 6);
    });

    it("returns the top five descending", () => {
        const probs = new Probs(Float32Array.from([0.05, 0.4, 0.01, 0.3, 0.2, 0.04]));
        expect([...probs.top5]).toEqual([1, 3, 4, 0, 5]);
        expect([...probs.top5conf].map((value) => Number(value.toFixed(2)))).toEqual([
            0.4, 0.3, 0.2, 0.05, 0.04,
        ]);
    });

    it("keeps the lower class index first on a tie", () => {
        const probs = new Probs(Float32Array.from([0.5, 0.5, 0.5, 0.1]));
        expect([...probs.top5]).toEqual([0, 1, 2, 3]);
        expect(probs.top1).toBe(0);
    });

    it("agrees with a full sort across random vectors", () => {
        for (let round = 0; round < 40; round += 1) {
            const data = Float32Array.from({ length: 200 }, () => Math.round(Math.random() * 20));
            const probs = new Probs(data);
            const oracle = fullSortTopK(data, 5);
            expect([...probs.top5]).toEqual(oracle.indices);
            expect([...probs.top5conf]).toEqual(oracle.values);
        }
    });

    it("returns fewer entries than asked when the vector is shorter", () => {
        const probs = new Probs(Float32Array.from([0.6, 0.4]));
        expect([...probs.top5]).toEqual([0, 1]);
        expect(probs.length).toBe(2);
    });

    it("answers zero for an empty vector instead of throwing", () => {
        const probs = new Probs(new Float32Array(0));
        expect(probs.top1).toBe(0);
        expect(probs.top1conf).toBe(0);
        expect([...probs.top5]).toEqual([]);
        expect(probs.shape).toEqual([0]);
    });

    it("computes each selection once and hands back the same arrays", () => {
        const probs = new Probs(Float32Array.from([0.1, 0.9, 0.5]));
        expect(probs.top5).toBe(probs.top5);
        expect(probs.top5conf).toBe(probs.top5conf);
    });
});

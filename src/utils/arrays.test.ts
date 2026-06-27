import { chunk, groupBy, range, uniqueBy } from "./arrays";

describe("groupBy", () => {
    it("groups items by the computed key", () => {
        const result = groupBy([1, 2, 3, 4], (n) => (n % 2 === 0 ? "even" : "odd"));
        expect(result).toEqual({ odd: [1, 3], even: [2, 4] });
    });

    it("preserves insertion order within each bucket", () => {
        const items = [
            { city: "SP", id: 1 },
            { city: "RJ", id: 2 },
            { city: "SP", id: 3 },
        ];
        const result = groupBy(items, (u) => u.city);
        expect(result.SP.map((u) => u.id)).toEqual([1, 3]);
        expect(result.RJ.map((u) => u.id)).toEqual([2]);
    });

    it("supports numeric keys", () => {
        const result = groupBy([1, 2, 3], (n) => n % 2);
        expect(result).toEqual({ 0: [2], 1: [1, 3] });
    });

    it("returns an empty object for empty input", () => {
        expect(groupBy([], (n: number) => n)).toEqual({});
    });
});

describe("uniqueBy", () => {
    it("keeps the first occurrence of each key", () => {
        expect(uniqueBy([1, 2, 2, 3, 1], (n) => n)).toEqual([1, 2, 3]);
    });

    it("dedupes by object property", () => {
        const result = uniqueBy(
            [
                { id: 1, v: "a" },
                { id: 1, v: "b" },
                { id: 2, v: "c" },
            ],
            (u) => u.id,
        );
        expect(result).toEqual([
            { id: 1, v: "a" },
            { id: 2, v: "c" },
        ]);
    });

    it("returns an empty array for empty input", () => {
        expect(uniqueBy([], (x: number) => x)).toEqual([]);
    });

    it("treats NaN keys as equal (Set semantics)", () => {
        expect(uniqueBy([1, 2, 3], () => NaN)).toEqual([1]);
    });
});

describe("chunk", () => {
    it("splits into chunks of the given size", () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it("returns a single chunk when size exceeds length", () => {
        expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
    });

    it("returns an empty array for empty input", () => {
        expect(chunk([], 3)).toEqual([]);
    });

    it("throws RangeError when size is less than 1", () => {
        expect(() => chunk([1, 2], 0)).toThrow(RangeError);
        expect(() => chunk([1, 2], -1)).toThrow(RangeError);
    });
});

describe("range", () => {
    it("builds an ascending range with end exclusive", () => {
        expect(range(0, 5)).toEqual([0, 1, 2, 3, 4]);
    });

    it("supports a custom positive step", () => {
        expect(range(0, 10, 2)).toEqual([0, 2, 4, 6, 8]);
    });

    it("supports a negative step", () => {
        expect(range(5, 0, -1)).toEqual([5, 4, 3, 2, 1]);
    });

    it("returns empty when step direction does not progress toward end", () => {
        expect(range(0, 5, -1)).toEqual([]);
        expect(range(5, 0, 1)).toEqual([]);
    });

    it("returns empty when start equals end", () => {
        expect(range(3, 3)).toEqual([]);
    });

    it("returns empty for a zero step", () => {
        expect(range(0, 5, 0)).toEqual([]);
    });
});

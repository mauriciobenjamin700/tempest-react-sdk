import { deepMerge, isEmpty, omit, pick } from "./objects";

describe("pick", () => {
    it("keeps only the requested keys", () => {
        expect(pick({ id: 1, name: "Ana", age: 30 }, ["id", "name"])).toEqual({
            id: 1,
            name: "Ana",
        });
    });

    it("skips keys missing from the source", () => {
        const obj = { a: 1 } as { a: number; b?: number };
        expect(pick(obj, ["a", "b"])).toEqual({ a: 1 });
    });

    it("does not mutate the input", () => {
        const obj = { a: 1, b: 2 };
        pick(obj, ["a"]);
        expect(obj).toEqual({ a: 1, b: 2 });
    });

    it("returns an empty object when no keys are given", () => {
        expect(pick({ a: 1 }, [])).toEqual({});
    });
});

describe("omit", () => {
    it("removes the requested keys", () => {
        expect(omit({ id: 1, name: "Ana", age: 30 }, ["age"])).toEqual({
            id: 1,
            name: "Ana",
        });
    });

    it("does not mutate the input", () => {
        const obj = { a: 1, b: 2 };
        omit(obj, ["b"]);
        expect(obj).toEqual({ a: 1, b: 2 });
    });

    it("returns a shallow copy when no keys are removed", () => {
        const obj = { a: 1 };
        const result = omit(obj, []);
        expect(result).toEqual({ a: 1 });
        expect(result).not.toBe(obj);
    });
});

describe("deepMerge", () => {
    it("merges nested plain objects recursively", () => {
        interface Config {
            a?: number;
            nested?: { x?: number; y?: number; z?: number };
        }
        const result = deepMerge<Config>(
            { a: 1, nested: { x: 1, y: 2 } },
            { nested: { y: 20, z: 30 } },
        );
        expect(result).toEqual({ a: 1, nested: { x: 1, y: 20, z: 30 } });
    });

    it("replaces arrays instead of merging them", () => {
        expect(deepMerge({ tags: ["a", "b"] }, { tags: ["c"] })).toEqual({ tags: ["c"] });
    });

    it("replaces non-plain values like dates", () => {
        const next = new Date("2020-01-01");
        const result = deepMerge({ when: new Date("2010-01-01") }, { when: next });
        expect(result.when).toBe(next);
    });

    it("does not mutate target or source", () => {
        const target = { nested: { x: 1 } };
        const source = { nested: { y: 2 } } as Partial<{ nested: { x: number; y: number } }>;
        deepMerge(target, source);
        expect(target).toEqual({ nested: { x: 1 } });
        expect(source).toEqual({ nested: { y: 2 } });
    });

    it("adds new top-level keys from source", () => {
        const result = deepMerge({ a: 1 } as { a: number; b?: number }, { b: 2 });
        expect(result).toEqual({ a: 1, b: 2 });
    });
});

describe("isEmpty", () => {
    it("returns true for nullish values", () => {
        expect(isEmpty(null)).toBe(true);
        expect(isEmpty(undefined)).toBe(true);
    });

    it("returns true for empty strings, arrays and objects", () => {
        expect(isEmpty("")).toBe(true);
        expect(isEmpty([])).toBe(true);
        expect(isEmpty({})).toBe(true);
    });

    it("returns true for empty Map and Set", () => {
        expect(isEmpty(new Map())).toBe(true);
        expect(isEmpty(new Set())).toBe(true);
    });

    it("returns false for non-empty containers", () => {
        expect(isEmpty("x")).toBe(false);
        expect(isEmpty([1])).toBe(false);
        expect(isEmpty({ a: 1 })).toBe(false);
        expect(isEmpty(new Map([["a", 1]]))).toBe(false);
        expect(isEmpty(new Set([1]))).toBe(false);
    });

    it("returns false for numbers, booleans and dates", () => {
        expect(isEmpty(0)).toBe(false);
        expect(isEmpty(NaN)).toBe(false);
        expect(isEmpty(false)).toBe(false);
        expect(isEmpty(true)).toBe(false);
        expect(isEmpty(new Date())).toBe(false);
    });
});

import { assertNever, isDefined, isNumber, isPlainObject, isString } from "./guards";

describe("isDefined", () => {
    it("returns false for null and undefined", () => {
        expect(isDefined(null)).toBe(false);
        expect(isDefined(undefined)).toBe(false);
    });

    it("returns true for falsy-but-defined values", () => {
        expect(isDefined(0)).toBe(true);
        expect(isDefined("")).toBe(true);
        expect(isDefined(false)).toBe(true);
    });

    it("narrows nullable arrays when used as a filter predicate", () => {
        const xs: (number | null | undefined)[] = [1, null, 2, undefined];
        const clean: number[] = xs.filter(isDefined);
        expect(clean).toEqual([1, 2]);
    });
});

describe("isString", () => {
    it("returns true only for string primitives", () => {
        expect(isString("hi")).toBe(true);
        expect(isString("")).toBe(true);
    });

    it("returns false for non-strings", () => {
        expect(isString(42)).toBe(false);
        expect(isString(null)).toBe(false);
        expect(isString(["a"])).toBe(false);
    });
});

describe("isNumber", () => {
    it("returns true for finite numbers", () => {
        expect(isNumber(42)).toBe(true);
        expect(isNumber(0)).toBe(true);
        expect(isNumber(-1.5)).toBe(true);
    });

    it("excludes NaN", () => {
        expect(isNumber(NaN)).toBe(false);
    });

    it("returns false for non-numbers", () => {
        expect(isNumber("42")).toBe(false);
        expect(isNumber(null)).toBe(false);
    });
});

describe("isPlainObject", () => {
    it("returns true for object literals", () => {
        expect(isPlainObject({})).toBe(true);
        expect(isPlainObject({ a: 1 })).toBe(true);
        expect(isPlainObject(Object.create(null))).toBe(true);
    });

    it("returns false for arrays, null, dates and class instances", () => {
        expect(isPlainObject([])).toBe(false);
        expect(isPlainObject(null)).toBe(false);
        expect(isPlainObject(new Date())).toBe(false);
        expect(isPlainObject(new Map())).toBe(false);
        class Foo {}
        expect(isPlainObject(new Foo())).toBe(false);
    });

    it("returns false for primitives", () => {
        expect(isPlainObject(42)).toBe(false);
        expect(isPlainObject("x")).toBe(false);
    });
});

describe("assertNever", () => {
    it("throws with a default message", () => {
        expect(() => assertNever("oops" as never)).toThrow("Unexpected value: oops");
    });

    it("throws with a custom message", () => {
        expect(() => assertNever("oops" as never, "boom")).toThrow("boom");
    });
});

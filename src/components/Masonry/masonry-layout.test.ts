import { describe, expect, it } from "vitest";

import { columnsFor, distribute } from "./masonry-layout";

describe("columnsFor", () => {
    it("takes a fixed number as is", () => {
        expect(columnsFor(0, 3)).toBe(3);
        expect(columnsFor(2000, 3)).toBe(3);
    });

    it("reads the map as 'from this width up'", () => {
        const map = { 0: 1, 640: 2, 1024: 3 };
        expect(columnsFor(320, map)).toBe(1);
        expect(columnsFor(640, map)).toBe(2);
        expect(columnsFor(1023, map)).toBe(2);
        expect(columnsFor(1600, map)).toBe(3);
    });

    it("sorts the breakpoints instead of trusting insertion order", () => {
        // Written out of order on purpose — an object literal is not sorted.
        expect(columnsFor(1600, { 1024: 4, 0: 1, 640: 2 })).toBe(4);
    });

    it("never returns less than one column", () => {
        expect(columnsFor(100, 0)).toBe(1);
        expect(columnsFor(100, -3)).toBe(1);
        expect(columnsFor(100, {})).toBe(1);
    });

    it("floors a fractional count", () => {
        expect(columnsFor(100, 2.7)).toBe(2);
    });
});

describe("distribute", () => {
    it("puts everything in one column when asked for one", () => {
        expect(distribute([10, 20, 30], 1)).toEqual([[0, 1, 2]]);
    });

    it("feeds the shortest column, not round-robin", () => {
        // Round-robin would give [[0, 2], [1, 3]] and a 400px-tall first column.
        expect(distribute([300, 100, 100, 100], 2)).toEqual([[0], [1, 2, 3]]);
    });

    it("keeps the bottom edge as even as the content allows", () => {
        const heights = [100, 90, 80, 70, 60, 50];
        const columns = distribute(heights, 3);
        const totals = columns.map((column) =>
            column.reduce((sum, index) => sum + heights[index], 0),
        );
        expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(20);
    });

    it("returns empty columns rather than fewer columns", () => {
        expect(distribute([10], 3)).toEqual([[0], [], []]);
    });

    it("handles an empty list", () => {
        expect(distribute([], 2)).toEqual([[], []]);
    });

    it("treats a missing or zero height as weight 1, so nothing stacks in column 0", () => {
        const columns = distribute([0, 0, 0, 0], 2);
        expect(columns[0]).toHaveLength(2);
        expect(columns[1]).toHaveLength(2);
    });

    it("is deterministic — same input, same layout", () => {
        const heights = [120, 80, 200, 40, 90];
        expect(distribute(heights, 3)).toEqual(distribute(heights, 3));
    });

    it("ties go to the leftmost column, so the layout reads left to right", () => {
        expect(distribute([100, 100], 2)).toEqual([[0], [1]]);
    });
});

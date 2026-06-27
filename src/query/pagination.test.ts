import { describe, it, expect } from "vitest";

import { emptyOffsetPage, isCursorPage, isOffsetPage } from "./pagination";

describe("pagination guards", () => {
    it("isOffsetPage matches the offset envelope", () => {
        expect(isOffsetPage({ items: [], total: 0, page: 1, size: 20, pages: 0 })).toBe(true);
        expect(isOffsetPage({ items: [], next_cursor: null, has_more: false, limit: 20 })).toBe(
            false,
        );
        expect(isOffsetPage(null)).toBe(false);
    });

    it("isCursorPage matches the cursor envelope", () => {
        expect(isCursorPage({ items: [], next_cursor: null, has_more: false, limit: 20 })).toBe(
            true,
        );
        expect(isCursorPage({ items: [], total: 0, page: 1, size: 20, pages: 0 })).toBe(false);
    });

    it("emptyOffsetPage builds a blank page", () => {
        expect(emptyOffsetPage(50)).toEqual({
            items: [],
            total: 0,
            page: 1,
            size: 50,
            pages: 0,
        });
    });
});

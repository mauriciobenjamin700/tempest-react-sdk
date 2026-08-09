import { describe, expect, it } from "vitest";

import { iconAliases } from "./generated/aliases";
import { iconNames } from "./generated/icon-names";
import { fromMaterialSymbol, materialToLucide, MATERIAL_SYMBOL_FALLBACK } from "./material-symbols";

const known = new Set<string>(iconNames);
const canonical = new Set<string>(iconNames.filter((name) => !(name in iconAliases)));

/**
 * The table exists to stop a category from rendering nothing, so an entry
 * pointing at a slug lucide does not ship is the exact bug it was written to
 * eliminate — and it is invisible at runtime, because the lookup succeeds and
 * only the shard fetch comes back empty.
 *
 * These tests pin the whole image of the table, not a sample: every target is
 * checked, so a lucide bump that renames one of them fails here instead of in a
 * user's grid.
 */
describe("materialToLucide", () => {
    it("points every entry at a slug lucide ships", () => {
        const dangling = Object.entries(materialToLucide).filter(([, slug]) => !known.has(slug));

        expect(dangling).toEqual([]);
    });

    it("points every entry at a canonical slug, never a deprecated alias", () => {
        const deprecated = Object.entries(materialToLucide).filter(
            ([, slug]) => !canonical.has(slug),
        );

        expect(deprecated).toEqual([]);
    });

    it("keys the table by Material Symbols names, which are snake_case", () => {
        const malformed = Object.keys(materialToLucide).filter(
            (code) => !/^[a-z][a-z0-9_]*$/.test(code),
        );

        expect(malformed).toEqual([]);
    });

    it("keeps the accidental name collisions mapped to themselves", () => {
        const collisions = ["settings", "code", "key", "lock", "shield", "brush", "tv"];

        for (const code of collisions) {
            expect(materialToLucide[code]).toBe(code);
        }
    });

    it("falls back to a canonical slug", () => {
        expect(canonical.has(MATERIAL_SYMBOL_FALLBACK)).toBe(true);
    });
});

describe("fromMaterialSymbol", () => {
    it("translates a known code", () => {
        expect(fromMaterialSymbol("format_paint")).toBe("paint-roller");
    });

    it("returns the fallback for a code the table does not know", () => {
        expect(fromMaterialSymbol("rocket_launch")).toBe(MATERIAL_SYMBOL_FALLBACK);
    });

    it.each([null, undefined, "", "   "])("returns the fallback for %p", (code) => {
        expect(fromMaterialSymbol(code)).toBe(MATERIAL_SYMBOL_FALLBACK);
    });

    it("honours a caller-supplied fallback", () => {
        expect(fromMaterialSymbol("rocket_launch", "folder")).toBe("folder");
        expect(fromMaterialSymbol(null, "folder")).toBe("folder");
    });

    it("tolerates stray whitespace and capitals from a hand-written seed", () => {
        expect(fromMaterialSymbol("  Format_Paint  ")).toBe("paint-roller");
    });

    it("never returns a slug outside the icon list", () => {
        const codes = [...Object.keys(materialToLucide), "rocket_launch", ""];

        for (const code of codes) {
            expect(known.has(fromMaterialSymbol(code))).toBe(true);
        }
    });
});

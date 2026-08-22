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

/**
 * What the batch of hand-written pairs has to keep true.
 *
 * The table grew from 22 to 214 entries by taking the head of Material Symbols'
 * published popularity ranking, so the risk profile changed: the guards above
 * already prove every target is a real canonical lucide slug (they caught
 * `smile` and `history`, both deprecated aliases, on the first run), and what is
 * left to pin is that the *keys* are real Material Symbols names and that the
 * collapsing is deliberate rather than accidental.
 */
describe("materialToLucide — the seeded batch", () => {
    it("covers the codes an admin screen reaches for first", () => {
        const everyday = [
            "search",
            "home",
            "add",
            "edit",
            "delete",
            "close",
            "person",
            "logout",
            "visibility",
            "shopping_cart",
            "notifications",
            "calendar_month",
            "location_on",
            "credit_card",
            "local_shipping",
        ];

        for (const code of everyday) {
            expect(materialToLucide[code], code).toBeDefined();
        }
    });

    it("sends the outline twin of a name to the same slug as the filled one", () => {
        const twins: ReadonlyArray<readonly [string, string]> = [
            ["favorite", "favorite_border"],
            ["check_circle", "check_circle_outline"],
            ["person", "person_outline"],
            ["error", "error_outline"],
            ["help", "help_outline"],
            ["mail", "mail_outline"],
            ["delete", "delete_outline"],
            ["add_circle", "add_circle_outline"],
        ];

        for (const [filled, outline] of twins) {
            expect(materialToLucide[outline], outline).toBe(materialToLucide[filled]);
        }
    });

    it("keeps every key a snake_case Material Symbols name", () => {
        const malformed = Object.keys(materialToLucide).filter(
            (code) => !/^[a-z][a-z0-9_]*$/.test(code),
        );

        expect(malformed).toEqual([]);
    });

    it("resolves every key through fromMaterialSymbol to the slug the table names", () => {
        const wrong = Object.entries(materialToLucide).filter(
            ([code, slug]) => fromMaterialSymbol(code) !== slug,
        );

        expect(wrong).toEqual([]);
    });

    it("keeps the fallback reachable only for a code the table does not have", () => {
        expect(fromMaterialSymbol("no_such_code_exists")).toBe(MATERIAL_SYMBOL_FALLBACK);
        expect(materialToLucide.no_such_code_exists).toBeUndefined();
    });
});

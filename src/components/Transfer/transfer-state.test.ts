import { describe, expect, it } from "vitest";

import {
    applyMove,
    transferStrings,
    filterItems,
    movableIds,
    searchTextOf,
    splitSides,
    type TransferItem,
} from "./transfer-state";

const ITEMS: TransferItem[] = [
    { id: "a", label: "Administrador" },
    { id: "b", label: "São Paulo" },
    { id: "c", label: "Financeiro", disabled: true },
    { id: "d", label: "Suporte" },
];

describe("splitSides", () => {
    it("derives both panes from the value", () => {
        const { source, target } = splitSides(ITEMS, ["b", "d"]);
        expect(source.map((i) => i.id)).toEqual(["a", "c"]);
        expect(target.map((i) => i.id)).toEqual(["b", "d"]);
    });

    it("keeps catalogue order on both sides, not click order", () => {
        const { target } = splitSides(ITEMS, ["d", "a"]);
        expect(target.map((i) => i.id)).toEqual(["a", "d"]);
    });

    it("ignores an id the catalogue no longer has", () => {
        const { source, target } = splitSides(ITEMS, ["ghost"]);
        expect(target).toEqual([]);
        expect(source).toHaveLength(4);
    });
});

describe("filterItems", () => {
    it("returns everything for an empty query", () => {
        expect(filterItems(ITEMS, "")).toHaveLength(4);
        expect(filterItems(ITEMS, "   ")).toHaveLength(4);
    });

    it("matches case-insensitively", () => {
        expect(filterItems(ITEMS, "ADMIN").map((i) => i.id)).toEqual(["a"]);
    });

    it("matches without accents, both ways", () => {
        // A PT-BR audience types "sao" and expects "São Paulo".
        expect(filterItems(ITEMS, "sao").map((i) => i.id)).toEqual(["b"]);
        expect(filterItems(ITEMS, "são").map((i) => i.id)).toEqual(["b"]);
    });

    it("uses searchText when the label is a node", () => {
        const items: TransferItem[] = [{ id: "x", label: null, searchText: "Relatórios" }];
        expect(filterItems(items, "relatorios")).toHaveLength(1);
    });

    it("matches nothing when a node label has no searchText", () => {
        const items: TransferItem[] = [{ id: "x", label: null }];
        expect(filterItems(items, "a")).toEqual([]);
    });
});

describe("applyMove", () => {
    it("moves ids to the target in catalogue order", () => {
        expect(applyMove({ value: [], moving: ["d", "a"], to: "target", items: ITEMS })).toEqual([
            "a",
            "d",
        ]);
    });

    it("moves ids back to the source", () => {
        expect(
            applyMove({ value: ["a", "b", "d"], moving: ["b"], to: "source", items: ITEMS }),
        ).toEqual(["a", "d"]);
    });

    it("never moves a disabled row, whichever way", () => {
        expect(applyMove({ value: [], moving: ["c"], to: "target", items: ITEMS })).toEqual([]);
        expect(applyMove({ value: ["c"], moving: ["c"], to: "source", items: ITEMS })).toEqual([
            "c",
        ]);
    });

    it("ignores an id the catalogue does not have", () => {
        expect(applyMove({ value: [], moving: ["ghost"], to: "target", items: ITEMS })).toEqual([]);
    });

    it("is idempotent", () => {
        const once = applyMove({ value: [], moving: ["a"], to: "target", items: ITEMS });
        const twice = applyMove({ value: once, moving: ["a"], to: "target", items: ITEMS });
        expect(twice).toEqual(once);
    });

    it("never returns the same id twice", () => {
        const next = applyMove({ value: ["a"], moving: ["a", "a"], to: "target", items: ITEMS });
        expect(next).toEqual(["a"]);
    });
});

describe("movableIds", () => {
    it("drops the disabled rows", () => {
        expect(movableIds(ITEMS)).toEqual(["a", "b", "d"]);
    });
});

describe("searchTextOf", () => {
    it("prefers searchText, then a string label, then nothing", () => {
        expect(searchTextOf({ id: "1", label: "L", searchText: "S" })).toBe("S");
        expect(searchTextOf({ id: "1", label: "L" })).toBe("L");
        expect(searchTextOf({ id: "1", label: null })).toBe("");
    });
});

describe("transferStrings", () => {
    it("counts one moved item in the singular, in both locales", () => {
        expect(transferStrings("pt-BR").moved(1, "destino")).toBe("1 item movido para destino");
        expect(transferStrings("en").moved(1, "target")).toBe("1 item moved to target");
    });

    it("counts more than one in the plural, in both locales", () => {
        expect(transferStrings("pt-BR").moved(3, "origem")).toBe("3 itens movidos para origem");
        expect(transferStrings("en").moved(3, "source")).toBe("3 items moved to source");
    });
});

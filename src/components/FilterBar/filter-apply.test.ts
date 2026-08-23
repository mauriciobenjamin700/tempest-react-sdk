import { describe, expect, it } from "vitest";

import { applyFilters, orderRange } from "./filter-apply";
import type { Filter } from "./filter-model";

interface Order {
    titulo: string;
    total: number;
    criadoEm: string;
    status: string | null;
    ativo: boolean;
    tags: string[];
}

const ROWS: Order[] = [
    {
        titulo: "Nota 10",
        total: 100,
        criadoEm: "2026-03-05T13:00:00Z",
        status: "paid",
        ativo: true,
        tags: ["a"],
    },
    {
        titulo: "nota 2",
        total: 9,
        criadoEm: "2026-01-20T09:00:00Z",
        status: "sent",
        ativo: false,
        tags: [],
    },
    {
        titulo: "Recibo",
        total: 0,
        criadoEm: "2026-06-30T23:30:00Z",
        status: null,
        ativo: false,
        tags: ["b", "c"],
    },
];

const titles = (rows: Order[]): string[] => rows.map((row) => row.titulo);

describe("applyFilters", () => {
    it("returns every row when no filter is applied", () => {
        expect(applyFilters(ROWS, [])).toEqual(ROWS);
    });

    it("returns a new array rather than the one it was given", () => {
        expect(applyFilters(ROWS, [])).not.toBe(ROWS);
    });

    it("skips an incomplete filter instead of emptying the list", () => {
        const half: Filter = { field: "titulo", operator: "contains", value: "" };
        expect(applyFilters(ROWS, [half])).toHaveLength(3);
    });

    it("combines several filters with AND", () => {
        const rows = applyFilters(ROWS, [
            { field: "ativo", operator: "eq", value: "false" },
            { field: "total", operator: "gt", value: "5" },
        ]);
        expect(titles(rows)).toEqual(["nota 2"]);
    });

    it("drops a row whose field the filter does not name", () => {
        const rows = applyFilters(ROWS, [{ field: "ausente", operator: "eq", value: "x" }]);
        expect(rows).toEqual([]);
    });

    it("tolerates a list of primitives without throwing", () => {
        expect(applyFilters([1, 2], [{ field: "x", operator: "eq", value: "1" }])).toEqual([]);
    });
});

describe("applyFilters — text", () => {
    it("matches contains case-insensitively", () => {
        const rows = applyFilters(ROWS, [{ field: "titulo", operator: "contains", value: "NOTA" }]);
        expect(titles(rows)).toEqual(["Nota 10", "nota 2"]);
    });

    it("keeps eq case-sensitive, so it agrees with the server", () => {
        expect(applyFilters(ROWS, [{ field: "titulo", operator: "eq", value: "recibo" }])).toEqual(
            [],
        );
        expect(
            titles(applyFilters(ROWS, [{ field: "titulo", operator: "eq", value: "Recibo" }])),
        ).toEqual(["Recibo"]);
    });

    it("matches ne, including the rows whose value is absent", () => {
        const rows = applyFilters(ROWS, [{ field: "status", operator: "ne", value: "paid" }]);
        expect(titles(rows)).toEqual(["nota 2", "Recibo"]);
    });
});

describe("applyFilters — numbers", () => {
    it("compares numerically, not as text", () => {
        const rows = applyFilters(ROWS, [{ field: "total", operator: "gt", value: "10" }]);
        expect(titles(rows)).toEqual(["Nota 10"]);
    });

    it("includes the boundary for gte and lte", () => {
        expect(
            applyFilters(ROWS, [{ field: "total", operator: "gte", value: "100" }]),
        ).toHaveLength(1);
        expect(applyFilters(ROWS, [{ field: "total", operator: "lte", value: "0" }])).toHaveLength(
            1,
        );
    });

    it("matches lt below the value", () => {
        const rows = applyFilters(ROWS, [{ field: "total", operator: "lt", value: "9" }]);
        expect(titles(rows)).toEqual(["Recibo"]);
    });

    it("matches nothing when the filter value is not a number", () => {
        expect(applyFilters(ROWS, [{ field: "total", operator: "gt", value: "abc" }])).toEqual([]);
    });

    it("treats zero as a value, not as empty", () => {
        const rows = applyFilters(ROWS, [{ field: "total", operator: "notEmpty" }]);
        expect(rows).toHaveLength(3);
    });
});

describe("applyFilters — dates", () => {
    it("compares by day, so a timestamp inside the day still matches", () => {
        const rows = applyFilters(ROWS, [
            { field: "criadoEm", operator: "eq", value: "2026-03-05" },
        ]);
        expect(titles(rows)).toEqual(["Nota 10"]);
    });

    it("does not shift the day for a timestamp late in the local evening", () => {
        const rows = applyFilters([{ criadoEm: new Date(2026, 5, 30, 23, 30) }], [
            { field: "criadoEm", operator: "eq", value: "2026-06-30" },
        ] as Filter[]);
        expect(rows).toHaveLength(1);
    });

    it("matches gte from the first instant of the day", () => {
        const rows = applyFilters(ROWS, [
            { field: "criadoEm", operator: "gte", value: "2026-03-05" },
        ]);
        expect(titles(rows)).toEqual(["Nota 10", "Recibo"]);
    });

    it("matches an inclusive between", () => {
        const rows = applyFilters(ROWS, [
            { field: "criadoEm", operator: "between", value: ["2026-01-20", "2026-03-05"] },
        ]);
        expect(titles(rows)).toEqual(["Nota 10", "nota 2"]);
    });

    it("normalises an inverted between instead of matching nothing", () => {
        const rows = applyFilters(ROWS, [
            { field: "criadoEm", operator: "between", value: ["2026-03-05", "2026-01-20"] },
        ]);
        expect(titles(rows)).toEqual(["Nota 10", "nota 2"]);
    });

    it("matches nothing when the row value is not a date at all", () => {
        const rows = applyFilters(ROWS, [
            { field: "titulo", operator: "between", value: ["2026-01-01", "2026-12-31"] },
        ]);
        expect(rows).toEqual([]);
    });
});

describe("applyFilters — numeric between", () => {
    it("includes both ends", () => {
        const rows = applyFilters(ROWS, [
            { field: "total", operator: "between", value: ["0", "9"] },
        ]);
        expect(titles(rows)).toEqual(["nota 2", "Recibo"]);
    });

    it("normalises an inverted pair", () => {
        const rows = applyFilters(ROWS, [
            { field: "total", operator: "between", value: ["9", "0"] },
        ]);
        expect(titles(rows)).toEqual(["nota 2", "Recibo"]);
    });
});

describe("applyFilters — booleans", () => {
    it("matches true", () => {
        expect(
            titles(applyFilters(ROWS, [{ field: "ativo", operator: "eq", value: "true" }])),
        ).toEqual(["Nota 10"]);
    });

    it("matches false, which is a value and not an absence", () => {
        expect(
            titles(applyFilters(ROWS, [{ field: "ativo", operator: "eq", value: "false" }])),
        ).toEqual(["nota 2", "Recibo"]);
    });

    it("matches nothing for a value that is neither true nor false", () => {
        expect(applyFilters(ROWS, [{ field: "ativo", operator: "eq", value: "sim" }])).toEqual([]);
    });
});

describe("applyFilters — membership", () => {
    it("matches any of the listed values", () => {
        const rows = applyFilters(ROWS, [
            { field: "status", operator: "in", value: ["paid", "draft"] },
        ]);
        expect(titles(rows)).toEqual(["Nota 10"]);
    });

    it("matches a single-value list", () => {
        const rows = applyFilters(ROWS, [{ field: "status", operator: "in", value: ["sent"] }]);
        expect(titles(rows)).toEqual(["nota 2"]);
    });

    it("ignores an empty list, which is an incomplete filter", () => {
        expect(applyFilters(ROWS, [{ field: "status", operator: "in", value: [] }])).toHaveLength(
            3,
        );
    });
});

describe("applyFilters — emptiness", () => {
    it("counts null as empty", () => {
        expect(titles(applyFilters(ROWS, [{ field: "status", operator: "empty" }]))).toEqual([
            "Recibo",
        ]);
    });

    it("counts blank text as empty", () => {
        const rows = applyFilters([{ nome: "  " }, { nome: "x" }], [
            { field: "nome", operator: "empty" },
        ] as Filter[]);
        expect(rows).toEqual([{ nome: "  " }]);
    });

    it("counts an empty array as empty", () => {
        expect(titles(applyFilters(ROWS, [{ field: "tags", operator: "empty" }]))).toEqual([
            "nota 2",
        ]);
    });

    it("does not count false or zero as empty", () => {
        expect(applyFilters(ROWS, [{ field: "ativo", operator: "empty" }])).toEqual([]);
        expect(applyFilters(ROWS, [{ field: "total", operator: "empty" }])).toEqual([]);
    });

    it("matches the complement with notEmpty", () => {
        expect(titles(applyFilters(ROWS, [{ field: "status", operator: "notEmpty" }]))).toEqual([
            "Nota 10",
            "nota 2",
        ]);
    });
});

describe("orderRange", () => {
    it("keeps an ordered date pair", () => {
        expect(orderRange(["2026-01-01", "2026-02-01"])).toEqual(["2026-01-01", "2026-02-01"]);
    });

    it("swaps an inverted numeric pair", () => {
        expect(orderRange(["10", "2"])).toEqual(["2", "10"]);
    });

    it("falls back to natural text order", () => {
        expect(orderRange(["item 10", "item 2"])).toEqual(["item 2", "item 10"]);
    });

    it("tolerates a missing second value", () => {
        expect(orderRange(["a"])).toEqual(["", "a"]);
    });
});

describe("applyFilters — values that cannot be compared as dates", () => {
    it("matches nothing when the row holds an invalid Date", () => {
        const rows = [{ criadoEm: new Date(Number.NaN) }];
        const filter: Filter = {
            field: "criadoEm",
            operator: "gte",
            value: "2026-03-05",
        };
        expect(applyFilters(rows, [filter])).toEqual([]);
    });

    it("matches nothing when the row value is neither a Date nor text", () => {
        const rows = [{ criadoEm: { quando: "ontem" } }];
        const filter: Filter = {
            field: "criadoEm",
            operator: "gte",
            value: "2026-03-05",
        };
        expect(applyFilters(rows, [filter])).toEqual([]);
    });
});

describe("orderRange — text already in order", () => {
    it("keeps a pair the collator already reads as ascending", () => {
        expect(orderRange(["item 2", "item 10"])).toEqual(["item 2", "item 10"]);
    });
});

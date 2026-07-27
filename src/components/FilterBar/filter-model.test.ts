import { describe, expect, it } from "vitest";

import {
    defaultOperator,
    describeFilter,
    filtersFromSearchParams,
    filtersToSearchParams,
    isComplete,
    isMulti,
    isValueless,
    operatorLabel,
    operatorsFor,
    type Filter,
    type FilterField,
} from "./filter-model";

const FIELDS: FilterField[] = [
    { name: "titulo", label: "Título", type: "text" },
    { name: "total", label: "Total", type: "number" },
    { name: "criadoEm", label: "Criado em", type: "date" },
    {
        name: "status",
        label: "Status",
        type: "select",
        options: [
            { value: "paid", label: "Pago" },
            { value: "sent", label: "Enviado" },
        ],
    },
    { name: "ativo", label: "Ativo", type: "boolean" },
];

const field = (name: string): FilterField =>
    FIELDS.find((candidate) => candidate.name === name) as FilterField;

describe("operatorsFor", () => {
    it("offers operators that suit the type", () => {
        expect(operatorsFor(field("titulo"))).toContain("contains");
        expect(operatorsFor(field("total"))).toContain("between");
        expect(operatorsFor(field("ativo"))).toEqual(["eq"]);
    });

    it("lets a field restrict its own operators", () => {
        expect(operatorsFor({ name: "x", label: "X", type: "text", operators: ["eq"] })).toEqual([
            "eq",
        ]);
    });

    it("returns a copy, so a caller cannot edit the defaults", () => {
        const first = operatorsFor(field("titulo"));
        first.push("gt");
        expect(operatorsFor(field("titulo"))).not.toContain("gt");
    });
});

describe("defaultOperator", () => {
    it("is the first operator the field offers", () => {
        expect(defaultOperator(field("titulo"))).toBe("contains");
        expect(defaultOperator(field("total"))).toBe("eq");
    });
});

describe("isValueless / isMulti", () => {
    it("knows which operators need no value", () => {
        expect(isValueless("empty")).toBe(true);
        expect(isValueless("notEmpty")).toBe(true);
        expect(isValueless("eq")).toBe(false);
    });

    it("knows which operators take several values", () => {
        expect(isMulti("between")).toBe(true);
        expect(isMulti("in")).toBe(true);
        expect(isMulti("eq")).toBe(false);
    });
});

describe("isComplete", () => {
    it("accepts a valueless operator with no value", () => {
        expect(isComplete({ field: "titulo", operator: "empty" })).toBe(true);
    });

    it("rejects a missing or blank value", () => {
        expect(isComplete({ field: "titulo", operator: "eq" })).toBe(false);
        expect(isComplete({ field: "titulo", operator: "eq", value: "" })).toBe(false);
        expect(isComplete({ field: "titulo", operator: "eq", value: "   " })).toBe(false);
    });

    it("needs both ends of a between", () => {
        expect(isComplete({ field: "total", operator: "between", value: ["1"] })).toBe(false);
        expect(isComplete({ field: "total", operator: "between", value: ["1", ""] })).toBe(false);
        expect(isComplete({ field: "total", operator: "between", value: ["1", "9"] })).toBe(true);
    });

    it("needs at least one value for an in", () => {
        expect(isComplete({ field: "status", operator: "in", value: [] })).toBe(false);
        expect(isComplete({ field: "status", operator: "in", value: ["paid"] })).toBe(true);
    });
});

describe("describeFilter", () => {
    it("reads a filter in words", () => {
        expect(
            describeFilter({ field: "titulo", operator: "contains", value: "nota" }, FIELDS),
        ).toBe("Título contém nota");
    });

    it("resolves a select value to its label, not its key", () => {
        expect(describeFilter({ field: "status", operator: "eq", value: "paid" }, FIELDS)).toBe(
            "Status é Pago",
        );
    });

    it("joins the two ends of a between", () => {
        expect(
            describeFilter({ field: "total", operator: "between", value: ["10", "90"] }, FIELDS),
        ).toBe("Total entre 10 e 90");
        expect(
            describeFilter(
                { field: "total", operator: "between", value: ["10", "90"] },
                FIELDS,
                "en",
            ),
        ).toBe("Total between 10 and 90");
    });

    it("lists the values of an in", () => {
        expect(
            describeFilter({ field: "status", operator: "in", value: ["paid", "sent"] }, FIELDS),
        ).toBe("Status é um de Pago, Enviado");
    });

    it("omits the value for a valueless operator", () => {
        expect(describeFilter({ field: "titulo", operator: "empty" }, FIELDS)).toBe(
            "Título está vazio",
        );
    });

    it("falls back to the raw field name when the field is unknown", () => {
        expect(describeFilter({ field: "fantasma", operator: "eq", value: "x" }, FIELDS)).toBe(
            "fantasma é x",
        );
    });

    it("translates the operator", () => {
        expect(operatorLabel("contains", "en")).toBe("contains");
        expect(operatorLabel("contains")).toBe("contém");
    });
});

describe("filtersToSearchParams", () => {
    it("writes one param per filter", () => {
        const filters: Filter[] = [
            { field: "status", operator: "eq", value: "paid" },
            { field: "titulo", operator: "contains", value: "nota" },
        ];
        expect(filtersToSearchParams(filters).toString()).toBe(
            "status=eq%3Apaid&titulo=contains%3Anota",
        );
    });

    it("joins multi values with a pipe", () => {
        expect(
            filtersToSearchParams([{ field: "total", operator: "between", value: ["1", "9"] }]).get(
                "total",
            ),
        ).toBe("between:1|9");
    });

    it("writes a valueless operator with no colon", () => {
        expect(filtersToSearchParams([{ field: "titulo", operator: "empty" }]).get("titulo")).toBe(
            "empty",
        );
    });

    it("keeps two filters on the same field", () => {
        const params = filtersToSearchParams([
            { field: "status", operator: "eq", value: "paid" },
            { field: "status", operator: "ne", value: "sent" },
        ]);
        expect(params.getAll("status")).toEqual(["eq:paid", "ne:sent"]);
    });

    it("drops an incomplete filter instead of writing half of it", () => {
        expect(filtersToSearchParams([{ field: "titulo", operator: "eq" }]).toString()).toBe("");
    });
});

describe("filtersFromSearchParams", () => {
    /** Round-trip: what goes into the URL comes back the same. */
    it("reads back exactly what it wrote", () => {
        const filters: Filter[] = [
            { field: "status", operator: "eq", value: "paid" },
            { field: "total", operator: "between", value: ["1", "9"] },
            { field: "titulo", operator: "empty" },
        ];
        const params = filtersToSearchParams(filters);
        expect(filtersFromSearchParams(params, FIELDS)).toEqual(filters);
    });

    it("ignores a param that names no known field", () => {
        const params = new URLSearchParams("desconhecido=eq:1&status=eq:paid");
        expect(filtersFromSearchParams(params, FIELDS)).toEqual([
            { field: "status", operator: "eq", value: "paid" },
        ]);
    });

    it("ignores an operator the field does not offer", () => {
        // `contains` on a number field is not something the app can evaluate.
        expect(filtersFromSearchParams(new URLSearchParams("total=contains:1"), FIELDS)).toEqual(
            [],
        );
    });

    it("ignores an operator that is not an operator at all", () => {
        expect(filtersFromSearchParams(new URLSearchParams("status=drop:table"), FIELDS)).toEqual(
            [],
        );
    });

    it("drops a value-taking operator with no value", () => {
        expect(filtersFromSearchParams(new URLSearchParams("status=eq"), FIELDS)).toEqual([]);
        expect(filtersFromSearchParams(new URLSearchParams("status=eq:"), FIELDS)).toEqual([]);
    });

    it("drops an incomplete between rather than half-applying it", () => {
        expect(filtersFromSearchParams(new URLSearchParams("total=between:5"), FIELDS)).toEqual([]);
    });

    it("reads two filters on the same field", () => {
        const params = new URLSearchParams("status=eq:paid&status=ne:sent");
        expect(filtersFromSearchParams(params, FIELDS)).toHaveLength(2);
    });

    it("returns nothing for empty params", () => {
        expect(filtersFromSearchParams(new URLSearchParams(), FIELDS)).toEqual([]);
    });
});

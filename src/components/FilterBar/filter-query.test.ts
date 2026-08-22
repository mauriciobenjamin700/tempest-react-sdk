import { describe, expect, it } from "vitest";

import { filtersToQueryParams } from "./filter-query";
import type { FiltersToQueryParamsOptions } from "./filter-query";
import type { Filter } from "./filter-model";

const encode = (filters: Filter[], options?: FiltersToQueryParamsOptions): string =>
    filtersToQueryParams(filters, options).toString();

describe("filtersToQueryParams", () => {
    it("sends eq as the bare column, which the backend reads as equality", () => {
        expect(encode([{ field: "status", operator: "eq", value: "paid" }])).toBe("status=paid");
    });

    it("suffixes the comparison operators", () => {
        expect(encode([{ field: "total", operator: "ne", value: "0" }])).toBe("total__ne=0");
        expect(encode([{ field: "total", operator: "gt", value: "1" }])).toBe("total__gt=1");
        expect(encode([{ field: "total", operator: "gte", value: "1" }])).toBe("total__gte=1");
        expect(encode([{ field: "total", operator: "lt", value: "1" }])).toBe("total__lt=1");
        expect(encode([{ field: "total", operator: "lte", value: "1" }])).toBe("total__lte=1");
    });

    it("maps contains to the escaped, case-insensitive backend operator", () => {
        expect(encode([{ field: "titulo", operator: "contains", value: "nota" }])).toBe(
            "titulo__icontains=nota",
        );
    });

    it("repeats the param for between, low value first", () => {
        expect(
            encode([
                { field: "criadoEm", operator: "between", value: ["2026-03-01", "2026-03-31"] },
            ]),
        ).toBe("criadoEm__between=2026-03-01&criadoEm__between=2026-03-31");
    });

    it("orders an inverted between before sending it", () => {
        expect(
            encode([
                { field: "criadoEm", operator: "between", value: ["2026-03-31", "2026-03-01"] },
            ]),
        ).toBe("criadoEm__between=2026-03-01&criadoEm__between=2026-03-31");
    });

    it("repeats the param once per value of in", () => {
        expect(encode([{ field: "status", operator: "in", value: ["paid", "sent"] }])).toBe(
            "status__in=paid&status__in=sent",
        );
    });

    it("carries the direction of emptiness in the isnull value", () => {
        expect(encode([{ field: "status", operator: "empty" }])).toBe("status__isnull=true");
        expect(encode([{ field: "status", operator: "notEmpty" }])).toBe("status__isnull=false");
    });

    it("asks for exact equality on the name column, which is a substring search bare", () => {
        expect(encode([{ field: "name", operator: "eq", value: "João" }])).toBe(
            "name__iexact=Jo%C3%A3o",
        );
    });

    it("leaves the other operators on the name column alone", () => {
        expect(encode([{ field: "name", operator: "contains", value: "jo" }])).toBe(
            "name__icontains=jo",
        );
    });

    it("keeps two filters on the same field instead of collapsing them", () => {
        expect(
            encode([
                { field: "total", operator: "gte", value: "10" },
                { field: "total", operator: "lte", value: "90" },
            ]),
        ).toBe("total__gte=10&total__lte=90");
    });

    it("skips an incomplete filter", () => {
        expect(encode([{ field: "titulo", operator: "contains", value: "" }])).toBe("");
        expect(encode([{ field: "criadoEm", operator: "between", value: ["2026-01-01"] }])).toBe(
            "",
        );
    });

    it("returns empty params for an empty filter set", () => {
        expect([...filtersToQueryParams([]).keys()]).toEqual([]);
    });

    it("percent-encodes a value that would otherwise break the query string", () => {
        expect(encode([{ field: "titulo", operator: "contains", value: "a&b=c" }])).toBe(
            "titulo__icontains=a%26b%3Dc",
        );
    });
});

/**
 * The dialect is a default, not a law.
 *
 * The encoder shipped with `tempest-fastapi-sdk`'s conventions hardcoded — the
 * `name` column special case and the whole suffix table. That is right for the
 * Tempest stack and a wall for anybody else: a backend whose searchable column is
 * `razao_social` could not get the treatment, and one with no such special case
 * got an `__iexact` nobody asked for.
 */
describe("filtersToQueryParams — dialect overrides", () => {
    const eq = (field: string): Filter[] => [{ field, operator: "eq", value: "acme" }];

    it("special-cases the caller's substring columns instead of only `name`", () => {
        const options = { substringColumns: ["razao_social"] };

        expect(encode(eq("razao_social"), options)).toBe("razao_social__iexact=acme");
        expect(encode(eq("name"), options)).toBe("name=acme");
    });

    it("turns the special case off entirely with an empty list", () => {
        expect(encode(eq("name"), { substringColumns: [] })).toBe("name=acme");
    });

    it("keeps `name` special when no override is given", () => {
        expect(encode(eq("name"))).toBe("name__iexact=acme");
    });

    it("merges an operator override over the default table", () => {
        const options = { operatorSuffix: { ne: "__exclude" } };

        expect(encode([{ field: "status", operator: "ne", value: "pago" }], options)).toBe(
            "status__exclude=pago",
        );
        expect(encode([{ field: "titulo", operator: "contains", value: "nota" }], options)).toBe(
            "titulo__icontains=nota",
        );
    });

    it("leaves the module default untouched by a previous override", () => {
        encode([{ field: "status", operator: "ne", value: "pago" }], {
            operatorSuffix: { ne: "__exclude" },
        });

        expect(encode([{ field: "status", operator: "ne", value: "pago" }])).toBe(
            "status__ne=pago",
        );
    });
});

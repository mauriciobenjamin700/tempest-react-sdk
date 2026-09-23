import { describe, expect, it } from "vitest";

import type { ComboboxOption } from "@/components/Combobox";
import type { MultiSelectOption } from "@/components/MultiSelect";
import { ALL_OPTION_VALUE, toOptions, withAllOption, withEmptyOption } from "./options";
import type { SelectOption } from "./Select";

describe("toOptions", () => {
    it("keeps the order a string-keyed record was written in", () => {
        expect(toOptions({ b: "B", a: "A" })).toEqual([
            { value: "b", label: "B" },
            { value: "a", label: "A" },
        ]);
    });

    it("turns a numeric key into a string value an <option> can round-trip", () => {
        expect(toOptions({ 0: "Baixa" })).toEqual([{ value: "0", label: "Baixa" }]);
    });

    /**
     * The issue asked for "insertion order". A plain object cannot give it for
     * integer-like keys: `OrdinaryOwnPropertyKeys` enumerates them first and
     * ascending, whatever order they were written in. This pins the language
     * behaviour so the JSDoc that warns about it stays true.
     */
    it("documents that a record reorders integer-like keys ascending", () => {
        const values = toOptions({ 5: "Ótimo", 3: "Ok", 1: "Ruim" }).map((o) => o.value);
        expect(values).toEqual(["1", "3", "5"]);
    });

    it("keeps the written order of a Map, numeric keys included", () => {
        const humor = new Map<number, string>([
            [5, "Ótimo"],
            [3, "Ok"],
            [1, "Ruim"],
        ]);
        expect(toOptions(humor)).toEqual([
            { value: "5", label: "Ótimo" },
            { value: "3", label: "Ok" },
            { value: "1", label: "Ruim" },
        ]);
    });

    it("returns an empty list for an empty map", () => {
        expect(toOptions({})).toEqual([]);
    });

    it("produces a list every option-taking component accepts", () => {
        const list = toOptions({ a: "A" });
        const select: SelectOption[] = list;
        const multi: MultiSelectOption[] = list;
        const combo: ComboboxOption[] = list;
        expect([select, multi, combo].every((l) => l.length === 1)).toBe(true);
    });
});

describe("withAllOption", () => {
    it("prepends the no-filter entry with the exported value and a pt-BR label", () => {
        expect(withAllOption([{ value: "a", label: "A" }])).toEqual([
            { value: ALL_OPTION_VALUE, label: "Todos" },
            { value: "a", label: "A" },
        ]);
        expect(ALL_OPTION_VALUE).toBe("all");
    });

    it("takes a custom label", () => {
        expect(withAllOption([], "Todas")[0]).toEqual({ value: "all", label: "Todas" });
    });

    it("does not mutate the list it receives", () => {
        const source = Object.freeze([{ value: "a", label: "A" }]);
        const result = withAllOption(source);
        expect(source).toHaveLength(1);
        expect(result).not.toBe(source);
    });
});

describe("withEmptyOption", () => {
    it("prepends the empty entry a nullable field needs, with a pt-BR label", () => {
        expect(withEmptyOption([{ value: 1, label: "Um" }])).toEqual([
            { value: "", label: "— Não definido —" },
            { value: 1, label: "Um" },
        ]);
    });

    it("takes a custom label", () => {
        expect(withEmptyOption([], "Nenhum")[0]).toEqual({ value: "", label: "Nenhum" });
    });

    it("does not mutate the list it receives", () => {
        const source = Object.freeze([{ value: "a", label: "A" }]);
        withEmptyOption(source);
        expect(source).toEqual([{ value: "a", label: "A" }]);
    });
});

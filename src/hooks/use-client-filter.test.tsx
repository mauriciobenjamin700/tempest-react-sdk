import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useClientFilter } from "./use-client-filter";

type Item = { name: string; email: string };
const items: Item[] = [
    { name: "Alice", email: "a@b.com" },
    { name: "Bob", email: "bob@x.com" },
    { name: "Carol", email: "carol@x.com" },
];

describe("useClientFilter", () => {
    it("returns full list when search is empty", () => {
        const { result } = renderHook(() => useClientFilter(items, "", ["name"]));
        expect(result.current).toHaveLength(3);
    });

    it("filters by keys (case-insensitive)", () => {
        const { result } = renderHook(() => useClientFilter(items, "BOB", ["name", "email"]));
        expect(result.current).toEqual([items[1]]);
    });

    it("supports custom predicates", () => {
        const { result } = renderHook(() =>
            useClientFilter(items, "x.com", (item, term) => item.email.includes(term)),
        );
        expect(result.current).toHaveLength(2);
    });
});

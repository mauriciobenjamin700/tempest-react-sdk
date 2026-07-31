import { describe, expect, it } from "vitest";

import {
    classify,
    destructuredKeyCount,
    findFunctions,
    findPropsTypes,
    splitTopLevel,
} from "./functions.mjs";
import { maskSource } from "./mask.mjs";

const scan = (source) => findFunctions(maskSource(source).masked, { isTsx: true });

describe("splitTopLevel", () => {
    it("keeps a generic type argument as one item", () => {
        expect(splitTopLevel("a: Record<string, number>, b: string")).toEqual([
            "a: Record<string, number>",
            "b: string",
        ]);
    });

    it("does not count the > of an arrow default as a closing bracket", () => {
        expect(splitTopLevel("onPick = () => {}, other, third")).toEqual([
            "onPick = () => {}",
            "other",
            "third",
        ]);
    });

    it("splits members on a custom separator", () => {
        expect(splitTopLevel("a: string; b: number;", ";")).toEqual(["a: string", "b: number"]);
    });
});

describe("destructuredKeyCount", () => {
    it("ignores the rest element and DOM plumbing", () => {
        expect(destructuredKeyCount("{ variant, size, className, children, ...rest }")).toBe(2);
    });

    it("counts keys carrying defaults once", () => {
        expect(destructuredKeyCount('{ variant = "info", size = "md" }')).toBe(2);
    });

    it("returns 0 for a non-pattern parameter", () => {
        expect(destructuredKeyCount("props: CardProps")).toBe(0);
    });
});

describe("classify", () => {
    it("recognises hooks, components and plain functions", () => {
        expect(classify("useOrders", false)).toBe("hook");
        expect(classify("OrderTable", true)).toBe("component");
        expect(classify("OrderTable", false)).toBe("function");
        expect(classify("sortBy", true)).toBe("function");
    });
});

describe("findFunctions", () => {
    it("measures a declaration body in code lines, blank lines excluded", () => {
        const [fn] = scan(
            ["export function a() {", "  const x = 1;", "", "  return x;", "}"].join("\n"),
        );
        expect(fn.name).toBe("a");
        expect(fn.exported).toBe(true);
        expect(fn.bodyLines).toBe(4);
    });

    it("measures an arrow assigned to a const", () => {
        const [fn] = scan("const helper = (a, b) => {\n  return a + b;\n};");
        expect(fn.name).toBe("helper");
        expect(fn.exported).toBe(false);
        expect(fn.params).toEqual(["a", "b"]);
    });

    it("skips an expression-bodied arrow", () => {
        expect(scan("const double = (n) => n * 2;")).toEqual([]);
    });

    it("counts one destructured parameter as one parameter", () => {
        const [fn] = scan("export function Card({ a, b, c }: CardProps) {\n  return null;\n}");
        expect(fn.params).toHaveLength(1);
        expect(fn.destructuredProps).toBe(3);
    });

    it("handles a generic component signature", () => {
        const [fn] = scan(
            "export function List<T>({ items, render }: ListProps<T>) {\n  return null;\n}",
        );
        expect(fn.name).toBe("List");
        expect(fn.params).toHaveLength(1);
        expect(fn.destructuredProps).toBe(2);
    });

    it("reports each function once", () => {
        const found = scan("export function a() {\n  return 1;\n}\nfunction b() {\n  return 2;\n}");
        expect(found.map((f) => f.name)).toEqual(["a", "b"]);
    });
});

describe("findPropsTypes", () => {
    it("counts members of an interface", () => {
        const types = findPropsTypes(
            maskSource("interface CardProps {\n  a: string;\n  b?: number;\n}").masked,
        );
        expect(types.get("CardProps").count).toBe(2);
    });

    it("counts members of a type literal", () => {
        const types = findPropsTypes(maskSource("type CardProps = {\n  a: string;\n};").masked);
        expect(types.get("CardProps").count).toBe(1);
    });

    it("skips a union alias", () => {
        const types = findPropsTypes(
            maskSource('type CardProps = { as: "a" } | { as: "b"; href: string };').masked,
        );
        expect(types.has("CardProps")).toBe(false);
    });

    it("does not count a nested object as a separate member", () => {
        const types = findPropsTypes(
            maskSource("interface CardProps {\n  meta: { a: string; b: string };\n  c: number;\n}")
                .masked,
        );
        expect(types.get("CardProps").count).toBe(2);
    });
});

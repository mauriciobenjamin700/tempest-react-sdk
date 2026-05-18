import { describe, expect, it } from "vitest";
import { slugify, truncate } from "./strings";

describe("slugify", () => {
    it("lowercases and replaces spaces with -", () => {
        expect(slugify("Hello World")).toBe("hello-world");
    });

    it("strips accents", () => {
        expect(slugify("São Paulo")).toBe("sao-paulo");
        expect(slugify("Curitíba")).toBe("curitiba");
    });

    it("collapses runs of separators", () => {
        expect(slugify("a / b / c")).toBe("a-b-c");
        expect(slugify("a   b")).toBe("a-b");
    });

    it("trims leading/trailing separators", () => {
        expect(slugify("  hello  ")).toBe("hello");
        expect(slugify("---x---")).toBe("x");
    });

    it("handles empty input", () => {
        expect(slugify("")).toBe("");
    });
});

describe("truncate", () => {
    it("returns the input untouched when short enough", () => {
        expect(truncate("hello", 10)).toBe("hello");
    });

    it("truncates with default ellipsis", () => {
        expect(truncate("abcdefghij", 5)).toBe("abcd…");
    });

    it("respects a custom suffix", () => {
        expect(truncate("abcdefghij", 8, " (more)")).toBe("a (more)");
    });

    it("returns the input when length === max", () => {
        expect(truncate("12345", 5)).toBe("12345");
    });

    it("handles tiny max values without crashing", () => {
        expect(truncate("abcdef", 1)).toBe("…");
    });
});

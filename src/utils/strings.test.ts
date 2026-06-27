import { describe, expect, it } from "vitest";
import { camelCase, capitalize, kebabCase, pluralize, slugify, truncate } from "./strings";

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

describe("capitalize", () => {
    it("uppercases the first character", () => {
        expect(capitalize("hello world")).toBe("Hello world");
    });

    it("leaves an already-capitalized string unchanged", () => {
        expect(capitalize("Hello")).toBe("Hello");
    });

    it("handles empty input", () => {
        expect(capitalize("")).toBe("");
    });
});

describe("camelCase", () => {
    it("converts space-separated words", () => {
        expect(camelCase("hello world")).toBe("helloWorld");
    });

    it("converts hyphen and underscore separators", () => {
        expect(camelCase("foo-bar_baz")).toBe("fooBarBaz");
    });

    it("lowercases all-caps words", () => {
        expect(camelCase("API response")).toBe("apiResponse");
    });

    it("handles empty input", () => {
        expect(camelCase("")).toBe("");
    });
});

describe("kebabCase", () => {
    it("splits camelCase boundaries", () => {
        expect(kebabCase("helloWorld")).toBe("hello-world");
    });

    it("converts mixed separators", () => {
        expect(kebabCase("foo_bar baz")).toBe("foo-bar-baz");
    });

    it("handles consecutive uppercase", () => {
        expect(kebabCase("APIResponse")).toBe("api-response");
    });

    it("trims leading/trailing separators", () => {
        expect(kebabCase("  hello  ")).toBe("hello");
    });
});

describe("pluralize", () => {
    it("returns the singular for count of 1", () => {
        expect(pluralize(1, "item")).toBe("item");
    });

    it("returns the default plural for other counts", () => {
        expect(pluralize(0, "item")).toBe("items");
        expect(pluralize(3, "item")).toBe("items");
    });

    it("uses an explicit plural form", () => {
        expect(pluralize(2, "person", "people")).toBe("people");
    });
});

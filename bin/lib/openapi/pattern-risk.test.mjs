import { describe, expect, it } from "vitest";

import { hasNestedQuantifier } from "./pattern-risk.mjs";

describe("hasNestedQuantifier — flags the repeated-repetition shape (#533)", () => {
    it.each([
        "^(a+)+$",
        "^(a*)*$",
        "(\\w+\\s?)*",
        "^((x+))+$",
        "(?:a+){2,}",
        "(?<word>\\d+)+",
        "^(a|b+)*$",
        "(a{1,5})+",
    ])("%s is flagged", (pattern) => {
        expect(hasNestedQuantifier(pattern)).toBe(true);
    });

    it.each([
        "^[a-z]+$",
        "^([a-z0-9]+-)*[a-z0-9]+$",
        "^(\\d{3})+$",
        "^(ab)+$",
        "^(a+)$",
        "^(a+)?$",
        "[(a+)+]",
        "\\(a+\\)+",
        "^(?=a+)b$",
        "^\\d{5}-?\\d{3}$",
        "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
        ")a+(",
    ])("%s is not flagged", (pattern) => {
        expect(hasNestedQuantifier(pattern)).toBe(false);
    });

    it("the flagged shape really is exponential in V8, so the warning is not theoretical", () => {
        const time = (n) => {
            const start = performance.now();
            /^(a+)+$/.test(`${"a".repeat(n)}!`);
            return performance.now() - start;
        };
        time(14);
        expect(time(22)).toBeGreaterThan(time(14) * 4);
    });
});

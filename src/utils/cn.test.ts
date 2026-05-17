import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
    it("joins truthy strings", () => {
        expect(cn("a", "b", "c")).toBe("a b c");
    });

    it("ignores falsy values", () => {
        expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
    });

    it("flattens nested arrays", () => {
        expect(cn("a", ["b", ["c", false, "d"]])).toBe("a b c d");
    });

    it("keeps numeric values", () => {
        expect(cn("a", 0, 1)).toBe("a 0 1");
    });
});

import { describe, expect, it, vi } from "vitest";
import { createInMemoryFlags } from "./in-memory-adapter";

describe("createInMemoryFlags", () => {
    it("reads initial values", () => {
        const flags = createInMemoryFlags({ initial: { x: true, y: "v" } });
        expect(flags.isEnabled("x")).toBe(true);
        expect(flags.get("y")).toBe("v");
    });

    it("returns the default when key is missing", () => {
        const flags = createInMemoryFlags();
        expect(flags.isEnabled("missing", true)).toBe(true);
        expect(flags.get("missing", 42)).toBe(42);
    });

    it("notifies listeners on change", () => {
        const flags = createInMemoryFlags();
        const listener = vi.fn();
        flags.onChange?.(listener);
        flags.set("x", true);
        expect(listener).toHaveBeenCalled();
    });
});

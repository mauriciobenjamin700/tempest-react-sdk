import { describe, expect, it, vi } from "vitest";
import { createGrowthBookFeatureFlagsAdapter } from "./growthbook-adapter";
import type { GrowthBookLike } from "./growthbook-adapter";

function makeGrowthBookMock(values: Record<string, unknown> = {}): GrowthBookLike & {
    fire: () => void;
} {
    let renderer: () => void = () => {};
    return {
        isOn: vi.fn((key: string) => Boolean(values[key])),
        getFeatureValue: ((key: string, defaultValue: unknown) =>
            key in values ? values[key] : defaultValue) as GrowthBookLike["getFeatureValue"],
        setRenderer: vi.fn((fn: () => void) => {
            renderer = fn;
        }),
        fire() {
            renderer();
        },
    };
}

describe("createGrowthBookFeatureFlagsAdapter", () => {
    it("isEnabled forwards to growthbook.isOn", () => {
        const gb = makeGrowthBookMock({ "new-checkout": true });
        const adapter = createGrowthBookFeatureFlagsAdapter({ growthbook: gb });
        expect(adapter.isEnabled("new-checkout")).toBe(true);
        expect(adapter.isEnabled("missing")).toBe(false);
    });

    it("get forwards to growthbook.getFeatureValue with default", () => {
        const gb = makeGrowthBookMock({ "max-items": 7 });
        const adapter = createGrowthBookFeatureFlagsAdapter({ growthbook: gb });
        expect(adapter.get<number>("max-items", 5)).toBe(7);
        expect(adapter.get<number>("missing", 5)).toBe(5);
    });

    it("onChange installs renderer and fires registered listeners", () => {
        const gb = makeGrowthBookMock();
        const adapter = createGrowthBookFeatureFlagsAdapter({ growthbook: gb });
        const listener = vi.fn();
        const unsubscribe = adapter.onChange!(listener);

        expect(gb.setRenderer).toHaveBeenCalledTimes(1);

        gb.fire();
        expect(listener).toHaveBeenCalledTimes(1);

        gb.fire();
        expect(listener).toHaveBeenCalledTimes(2);

        unsubscribe();
        gb.fire();
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("onChange installs the renderer only once even with multiple listeners", () => {
        const gb = makeGrowthBookMock();
        const adapter = createGrowthBookFeatureFlagsAdapter({ growthbook: gb });
        adapter.onChange!(vi.fn());
        adapter.onChange!(vi.fn());
        adapter.onChange!(vi.fn());
        expect(gb.setRenderer).toHaveBeenCalledTimes(1);
    });

    it("onChange works without setRenderer (listeners just never fire)", () => {
        const gb: GrowthBookLike = {
            isOn: () => false,
            getFeatureValue: (_key, defaultValue) => defaultValue,
        };
        const adapter = createGrowthBookFeatureFlagsAdapter({ growthbook: gb });
        const listener = vi.fn();
        expect(() => adapter.onChange!(listener)).not.toThrow();
    });
});

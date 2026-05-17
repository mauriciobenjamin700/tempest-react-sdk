import { describe, expect, it, vi } from "vitest";
import { createLaunchDarklyFeatureFlagsAdapter } from "./launchdarkly-adapter";
import type { LDClientLike } from "./launchdarkly-adapter";

function makeLDMock(values: Record<string, unknown> = {}): LDClientLike & {
    fire: () => void;
} {
    const handlers: Record<string, Set<() => void>> = {};
    return {
        variation: ((key: string, defaultValue: unknown) =>
            key in values ? values[key] : defaultValue) as LDClientLike["variation"],
        on: vi.fn((event: string, handler: () => void) => {
            handlers[event] = handlers[event] ?? new Set();
            handlers[event].add(handler);
        }),
        off: vi.fn((event: string, handler: () => void) => {
            handlers[event]?.delete(handler);
        }),
        fire() {
            for (const h of handlers["change"] ?? []) h();
        },
    };
}

describe("createLaunchDarklyFeatureFlagsAdapter", () => {
    it("isEnabled returns true only when variation === true", () => {
        const client = makeLDMock({ a: true, b: false, c: "on", d: 1 });
        const adapter = createLaunchDarklyFeatureFlagsAdapter({ client });
        expect(adapter.isEnabled("a")).toBe(true);
        expect(adapter.isEnabled("b")).toBe(false);
        expect(adapter.isEnabled("c")).toBe(false);
        expect(adapter.isEnabled("d")).toBe(false);
    });

    it("isEnabled falls back to default when the flag is missing", () => {
        const client = makeLDMock({});
        const adapter = createLaunchDarklyFeatureFlagsAdapter({ client });
        expect(adapter.isEnabled("missing")).toBe(false);
        expect(adapter.isEnabled("missing", true)).toBe(true);
    });

    it("get forwards to client.variation with default", () => {
        const client = makeLDMock({ "max-items": 7 });
        const adapter = createLaunchDarklyFeatureFlagsAdapter({ client });
        expect(adapter.get<number>("max-items", 5)).toBe(7);
        expect(adapter.get<number>("missing", 5)).toBe(5);
    });

    it("onChange subscribes via client.on and unsubscribe calls client.off", () => {
        const client = makeLDMock();
        const adapter = createLaunchDarklyFeatureFlagsAdapter({ client });
        const listener = vi.fn();
        const unsubscribe = adapter.onChange!(listener);
        expect(client.on).toHaveBeenCalledWith("change", listener);

        client.fire();
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        expect(client.off).toHaveBeenCalledWith("change", listener);
        client.fire();
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("onChange returns a no-op unsubscribe when on/off are missing", () => {
        const client: LDClientLike = {
            variation: (_key, defaultValue) => defaultValue,
        };
        const adapter = createLaunchDarklyFeatureFlagsAdapter({ client });
        const unsubscribe = adapter.onChange!(vi.fn());
        expect(() => unsubscribe()).not.toThrow();
    });
});

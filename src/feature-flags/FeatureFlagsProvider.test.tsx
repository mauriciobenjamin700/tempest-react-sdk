import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { FeatureFlagsProvider, useFeatureFlag, useFlagValue } from "./FeatureFlagsProvider";
import { createInMemoryFlags } from "./in-memory-adapter";

describe("FeatureFlagsProvider + hooks", () => {
    it("returns flag values via useFeatureFlag", () => {
        const adapter = createInMemoryFlags({ initial: { newFeed: true } });
        const wrapper = ({ children }: { children: ReactNode }) => (
            <FeatureFlagsProvider adapter={adapter}>{children}</FeatureFlagsProvider>
        );
        const { result } = renderHook(() => useFeatureFlag("newFeed", false), { wrapper });
        expect(result.current).toBe(true);
    });

    it("re-renders on flag change", () => {
        const adapter = createInMemoryFlags();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <FeatureFlagsProvider adapter={adapter}>{children}</FeatureFlagsProvider>
        );
        const { result } = renderHook(() => useFeatureFlag("x", false), { wrapper });
        expect(result.current).toBe(false);
        act(() => adapter.set("x", true));
        expect(result.current).toBe(true);
    });

    it("useFlagValue returns typed value", () => {
        const adapter = createInMemoryFlags({ initial: { max: 25 } });
        const wrapper = ({ children }: { children: ReactNode }) => (
            <FeatureFlagsProvider adapter={adapter}>{children}</FeatureFlagsProvider>
        );
        const { result } = renderHook(() => useFlagValue<number>("max", 10), { wrapper });
        expect(result.current).toBe(25);
    });

    it("throws outside provider", () => {
        expect(() => renderHook(() => useFeatureFlag("x"))).toThrow();
    });
});

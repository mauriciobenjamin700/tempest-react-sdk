import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
    FeatureFlagsProvider,
    useFeatureFlag,
    useFlagValue,
} from "./FeatureFlagsProvider";
import type { FeatureFlagsAdapter } from "./types";

const adapter: FeatureFlagsAdapter = {
    isEnabled: (key, defaultValue = false) => (key === "on" ? true : defaultValue),
    get: <T,>(key: string, defaultValue?: T): T =>
        (key === "n" ? (42 as T) : (defaultValue as T)) as T,
};

const wrapper = ({ children }: { children: ReactNode }) => (
    <FeatureFlagsProvider adapter={adapter}>{children}</FeatureFlagsProvider>
);

describe("FeatureFlags without onChange", () => {
    it("still works for isEnabled lookups", () => {
        const { result } = renderHook(() => useFeatureFlag("on"), { wrapper });
        expect(result.current).toBe(true);
    });

    it("returns typed value via useFlagValue", () => {
        const { result } = renderHook(() => useFlagValue<number>("n", 0), { wrapper });
        expect(result.current).toBe(42);
    });
});

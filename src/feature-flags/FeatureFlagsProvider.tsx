import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { FeatureFlagsAdapter, FlagValue } from "./types";

const FeatureFlagsContext = createContext<FeatureFlagsAdapter | null>(null);

export interface FeatureFlagsProviderProps {
    adapter: FeatureFlagsAdapter;
    children: ReactNode;
}

/** Inject a feature flags adapter into the tree. */
export function FeatureFlagsProvider({ adapter, children }: FeatureFlagsProviderProps) {
    const value = useMemo(() => adapter, [adapter]);
    useEffect(() => undefined, [value]);
    return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

function useAdapter(): FeatureFlagsAdapter {
    const ctx = useContext(FeatureFlagsContext);
    if (!ctx) throw new Error("useFeatureFlag requires <FeatureFlagsProvider>");
    return ctx;
}

/**
 * Read a boolean flag and re-render when the adapter fires `onChange`.
 *
 * @example
 * const showNewFeed = useFeatureFlag("new-feed", false);
 */
export function useFeatureFlag(key: string, defaultValue = false): boolean {
    const adapter = useAdapter();
    const subscribe = (listener: () => void): (() => void) =>
        adapter.onChange ? adapter.onChange(listener) : () => undefined;
    const get = (): boolean => adapter.isEnabled(key, defaultValue);
    return useSyncExternalStore(subscribe, get, get);
}

/**
 * Read a typed flag value (string / number / boolean / null) and re-render
 * on change.
 */
export function useFlagValue<T extends FlagValue = FlagValue>(key: string, defaultValue?: T): T {
    const adapter = useAdapter();
    const subscribe = (listener: () => void): (() => void) =>
        adapter.onChange ? adapter.onChange(listener) : () => undefined;
    const get = (): T => adapter.get<T>(key, defaultValue);
    return useSyncExternalStore(subscribe, get, get);
}


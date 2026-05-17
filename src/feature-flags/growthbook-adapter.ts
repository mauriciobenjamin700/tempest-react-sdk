import type { FeatureFlagsAdapter, FlagValue } from "./types";

/**
 * Minimal subset of [`@growthbook/growthbook`](https://docs.growthbook.io/lib/js)
 * used by the adapter. Pass a `GrowthBook` instance directly.
 */
export interface GrowthBookLike {
    isOn: (key: string) => boolean;
    getFeatureValue: <T>(key: string, defaultValue: T) => T;
    /** Registers a renderer fired whenever GrowthBook re-evaluates features. */
    setRenderer?: (renderer: () => void) => void;
}

export interface CreateGrowthBookFeatureFlagsAdapterOptions {
    /** The GrowthBook instance. Required. */
    growthbook: GrowthBookLike;
}

/**
 * Build a [[FeatureFlagsAdapter]] backed by a GrowthBook instance. Apps
 * initialise GrowthBook themselves (so they can load features over the
 * network, set attributes, etc.) — the adapter just routes lookups.
 *
 * Mapping:
 * - `isEnabled(key, default)` → `growthbook.isOn(key)` (falls back to `default` if no value)
 * - `get(key, default)` → `growthbook.getFeatureValue(key, default)`
 * - `onChange(listener)` → `growthbook.setRenderer(listener)` (single-renderer SDK constraint)
 *
 * @example
 * import { GrowthBook } from "@growthbook/growthbook";
 * import { FeatureFlagsProvider, createGrowthBookFeatureFlagsAdapter } from "tempest-react-sdk";
 *
 * const gb = new GrowthBook({ apiHost: "...", clientKey: "..." });
 * await gb.loadFeatures();
 * const adapter = createGrowthBookFeatureFlagsAdapter({ growthbook: gb });
 *
 * <FeatureFlagsProvider adapter={adapter}><App /></FeatureFlagsProvider>;
 */
export function createGrowthBookFeatureFlagsAdapter(
    options: CreateGrowthBookFeatureFlagsAdapterOptions,
): FeatureFlagsAdapter {
    const { growthbook } = options;
    const listeners = new Set<() => void>();
    let rendererInstalled = false;

    function ensureRenderer(): void {
        if (rendererInstalled || !growthbook.setRenderer) return;
        rendererInstalled = true;
        growthbook.setRenderer(() => {
            for (const listener of listeners) listener();
        });
    }

    return {
        isEnabled(key: string, defaultValue = false) {
            const value = growthbook.isOn(key);
            if (typeof value === "boolean") return value;
            return defaultValue;
        },
        get<T extends FlagValue = FlagValue>(key: string, defaultValue?: T): T {
            return growthbook.getFeatureValue(key, defaultValue as T);
        },
        onChange(listener) {
            ensureRenderer();
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

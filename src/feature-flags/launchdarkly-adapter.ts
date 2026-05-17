import type { FeatureFlagsAdapter, FlagValue } from "./types";

/**
 * Minimal subset of [`launchdarkly-js-client-sdk`](https://docs.launchdarkly.com/sdk/client-side/javascript)
 * used by the adapter. Pass an existing `LDClient`.
 */
export interface LDClientLike {
    variation: <T = unknown>(key: string, defaultValue: T) => T;
    on?: (event: string, handler: () => void) => void;
    off?: (event: string, handler: () => void) => void;
}

export interface CreateLaunchDarklyFeatureFlagsAdapterOptions {
    /** The LaunchDarkly JS client. Required. */
    client: LDClientLike;
}

/**
 * Build a [[FeatureFlagsAdapter]] backed by a LaunchDarkly JS client. Apps
 * initialise the client themselves (`LDClient.initialize(envKey, ctx)`) and
 * pass it in.
 *
 * Mapping:
 * - `isEnabled(key, default)` → `client.variation(key, default) === true`
 * - `get(key, default)` → `client.variation(key, default)`
 * - `onChange(listener)` → `client.on("change", listener)` / `client.off("change", listener)`
 *
 * @example
 * import * as LDClient from "launchdarkly-js-client-sdk";
 * import { FeatureFlagsProvider, createLaunchDarklyFeatureFlagsAdapter } from "tempest-react-sdk";
 *
 * const client = LDClient.initialize(import.meta.env.VITE_LD_CLIENT_ID, { kind: "user", key: userId });
 * await client.waitUntilReady();
 * const adapter = createLaunchDarklyFeatureFlagsAdapter({ client });
 *
 * <FeatureFlagsProvider adapter={adapter}><App /></FeatureFlagsProvider>;
 */
export function createLaunchDarklyFeatureFlagsAdapter(
    options: CreateLaunchDarklyFeatureFlagsAdapterOptions,
): FeatureFlagsAdapter {
    const { client } = options;

    return {
        isEnabled(key: string, defaultValue = false) {
            return client.variation<boolean>(key, defaultValue) === true;
        },
        get<T extends FlagValue = FlagValue>(key: string, defaultValue?: T): T {
            return client.variation<T>(key, defaultValue as T);
        },
        onChange(listener) {
            if (!client.on || !client.off) {
                return () => {};
            }
            client.on("change", listener);
            return () => {
                client.off!("change", listener);
            };
        },
    };
}

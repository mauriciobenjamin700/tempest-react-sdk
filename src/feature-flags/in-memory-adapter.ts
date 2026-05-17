import type { FeatureFlagsAdapter, FlagValue } from "./types";

export interface InMemoryFlagsOptions {
    initial?: Record<string, FlagValue>;
}

/**
 * Trivial in-memory adapter. Suitable for tests, local development, or as a
 * fallback wrapping the real provider while it loads.
 */
export function createInMemoryFlags(options: InMemoryFlagsOptions = {}): FeatureFlagsAdapter & {
    set: (key: string, value: FlagValue) => void;
} {
    const flags: Record<string, FlagValue> = { ...(options.initial ?? {}) };
    const listeners = new Set<() => void>();

    function notify(): void {
        for (const listener of listeners) listener();
    }

    return {
        isEnabled(key, defaultValue = false) {
            return key in flags ? Boolean(flags[key]) : defaultValue;
        },
        get<T extends FlagValue = FlagValue>(key: string, defaultValue?: T): T {
            return (key in flags ? (flags[key] as T) : (defaultValue as T)) as T;
        },
        onChange(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        set(key, value) {
            flags[key] = value;
            notify();
        },
    };
}

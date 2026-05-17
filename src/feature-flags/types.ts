export type FlagValue = boolean | string | number | null;

export interface FeatureFlagsAdapter {
    /** Synchronous lookup of a flag with a default. */
    isEnabled: (key: string, defaultValue?: boolean) => boolean;
    /** Read a string/number/json flag value. */
    get: <T extends FlagValue = FlagValue>(key: string, defaultValue?: T) => T;
    /** Subscribe to flag changes. Optional. */
    onChange?: (listener: () => void) => () => void;
}

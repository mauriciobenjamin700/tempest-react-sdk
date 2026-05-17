/** Recommended `staleTime` presets (milliseconds). */
export const STALE_TIME = {
    SHORT: 30 * 1000,
    DEFAULT: 5 * 60 * 1000,
    LONG: 30 * 60 * 1000,
    INFINITE: Infinity,
} as const;

/** Recommended `gcTime` presets (milliseconds). */
export const CACHE_TIME = {
    SHORT: 5 * 60 * 1000,
    DEFAULT: 30 * 60 * 1000,
    LONG: 60 * 60 * 1000,
} as const;

/** Recommended refetch intervals (milliseconds). */
export const REFETCH_TIME = {
    REALTIME: 5 * 1000,
    FAST: 30 * 1000,
    DEFAULT: 60 * 1000,
    SLOW: 5 * 60 * 1000,
} as const;

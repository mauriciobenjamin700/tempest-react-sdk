import { create } from "zustand";
import type { StateCreator, StoreApi, UseBoundStore } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { PersistOptions } from "zustand/middleware";

/**
 * Persistence options for {@link createStore}. Mirrors the subset of Zustand's
 * `persist` middleware that apps usually need, with sensible Tempest defaults.
 */
export interface CreateStorePersistOptions<T> {
    /** Storage key (required to enable persistence). */
    name: string;
    /** Which Web Storage to use (default: `"local"`). */
    storage?: "local" | "session";
    /**
     * Pick the slice of state to persist. Defaults to persisting the whole
     * state. Use this to avoid writing transient/derived fields.
     */
    partialize?: PersistOptions<T, Partial<T>>["partialize"];
    /** Persisted schema version, forwarded to Zustand for migrations. */
    version?: number;
    /** Migration function forwarded to Zustand's `persist` middleware. */
    migrate?: PersistOptions<T, Partial<T>>["migrate"];
}

/**
 * Options accepted by {@link createStore}.
 */
export interface CreateStoreOptions<T> {
    /** Enable `localStorage`/`sessionStorage` persistence for the store. */
    persist?: CreateStorePersistOptions<T>;
}

/**
 * Create a typed Zustand store with optional `persist` middleware, wired with
 * Tempest defaults. This is the generic counterpart to `createAuthStore`: use
 * it for any domain slice (cart, preferences, wizard state, …) without
 * re-writing the persistence boilerplate in every app.
 *
 * @typeParam T - The store state shape (state + actions).
 * @param initializer - Standard Zustand `StateCreator` (`(set, get) => state`).
 * @param options - Optional persistence configuration.
 * @returns A bound Zustand hook (`useStore`) with the usual `getState`/`setState`/`subscribe` API.
 *
 * @example
 * interface CartState {
 *     items: string[];
 *     add: (id: string) => void;
 *     clear: () => void;
 * }
 *
 * const useCart = createStore<CartState>(
 *     (set) => ({
 *         items: [],
 *         add: (id) => set((s) => ({ items: [...s.items, id] })),
 *         clear: () => set({ items: [] }),
 *     }),
 *     { persist: { name: "cart", partialize: (s) => ({ items: s.items }) } },
 * );
 */
export function createStore<T>(
    initializer: StateCreator<T, [], []>,
    options: CreateStoreOptions<T> = {},
): UseBoundStore<StoreApi<T>> {
    if (!options.persist) {
        return create<T>()(initializer);
    }

    const { name, storage = "local", partialize, version, migrate } = options.persist;
    const storageImpl = storage === "session" ? () => sessionStorage : () => localStorage;

    return create<T>()(
        persist(initializer, {
            name,
            storage: createJSONStorage(storageImpl),
            ...(partialize ? { partialize } : {}),
            ...(version !== undefined ? { version } : {}),
            ...(migrate ? { migrate } : {}),
        }),
    );
}

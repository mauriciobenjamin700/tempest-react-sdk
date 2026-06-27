import type { StoreApi, UseBoundStore } from "zustand";

/**
 * A bound Zustand hook augmented with auto-generated per-field selector hooks
 * under `.use`. Reading a single field via `store.use.field()` subscribes the
 * component only to that field, avoiding re-renders when unrelated slices change.
 */
export type WithSelectors<S> = S extends { getState: () => infer T }
    ? S & { use: { [K in keyof T]: () => T[K] } }
    : never;

/**
 * Attach auto-generated selector hooks to a Zustand store. Instead of writing
 * `useStore((s) => s.user)` at every call site, you get `useStore.use.user()`
 * — one memoized selector per top-level state key.
 *
 * @typeParam S - The bound store hook type returned by `create`/{@link createStore}.
 * @param store - The bound Zustand hook.
 * @returns The same hook with a `.use` namespace of field selectors.
 *
 * @example
 * const useCart = createSelectors(
 *     createStore<CartState>((set) => ({ items: [], add: (id) => ... })),
 * );
 * const items = useCart.use.items(); // subscribes only to `items`
 */
export function createSelectors<S extends UseBoundStore<StoreApi<object>>>(
    store: S,
): WithSelectors<S> {
    const bound = store as WithSelectors<S>;
    bound.use = {} as WithSelectors<S>["use"];
    for (const key of Object.keys(store.getState())) {
        (bound.use as Record<string, () => unknown>)[key] = () =>
            store((state) => (state as Record<string, unknown>)[key]);
    }
    return bound;
}

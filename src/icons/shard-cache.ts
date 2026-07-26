import type { LucideIcon } from "lucide-react";

import { iconAliases } from "./generated/aliases";
import { shardLoaders } from "./generated/loaders";

/**
 * Slugs resolved so far, across every shard already fetched.
 *
 * Module-level and readable **synchronously**, which is the whole point: once a
 * page has rendered one icon whose slug starts with `s`, every other `s` icon is
 * already in memory and paints on its first frame. A cache that could only be
 * read from an effect would flash a fallback for each new icon, which is the
 * behavior `lucide-react`'s own `DynamicIcon` has.
 */
const resolved = new Map<string, LucideIcon>();

/** In-flight shard fetches, so N icons from one shard trigger one import. */
const inFlight = new Map<string, Promise<void>>();

/**
 * Initial letters whose shard has already settled.
 *
 * Needed to tell "still loading" from "no such icon": until the shard arrives,
 * absence from `resolved` proves nothing. Only once the letter is in here does a
 * missing slug mean the name is genuinely wrong — which is what lets `Icon` warn
 * about a typo without also warning on every icon mid-flight.
 */
const settledLetters = new Set<string>();

/** Callbacks to run after a shard lands, so mounted `<Icon>`s re-render. */
const listeners = new Set<() => void>();

/**
 * Map a slug to the canonical slug that owns the icon.
 *
 * Lucide keeps 248 deprecated aliases (`alert-circle` → `circle-alert`), and a
 * slug persisted in a database years ago is exactly the case this feature exists
 * for, so an alias must keep resolving after a lucide bump renames it.
 *
 * @param slug - Any icon slug, canonical or deprecated.
 * @returns The canonical slug.
 */
export function resolveIconAlias(slug: string): string {
    return iconAliases[slug] ?? slug;
}

/**
 * Read an icon out of the cache without triggering a fetch.
 *
 * @param slug - Any icon slug, canonical or deprecated.
 * @returns The icon component, or `undefined` when its shard is not loaded yet.
 */
export function peekIcon(slug: string): LucideIcon | undefined {
    return resolved.get(resolveIconAlias(slug));
}

/**
 * Load the shard that owns `slug`, if it is not loaded or loading already.
 *
 * Resolves without error for an unknown slug: a name that came from an API is
 * data, not a programming mistake, so the caller renders its fallback instead of
 * seeing an exception thrown mid-render.
 *
 * @param slug - Any icon slug, canonical or deprecated.
 * @returns A promise that settles once the shard is in the cache.
 */
export function loadIcon(slug: string): Promise<void> {
    const canonical = resolveIconAlias(slug);
    if (resolved.has(canonical)) return Promise.resolve();

    const letter = canonical[0] ?? "";
    const loader = shardLoaders[letter];
    if (!loader) return Promise.resolve();

    const pending = inFlight.get(letter);
    if (pending) return pending;

    const promise = loader()
        .then((mod) => {
            for (const [name, icon] of Object.entries(mod.default)) resolved.set(name, icon);
        })
        .catch(() => undefined)
        .finally(() => {
            inFlight.delete(letter);
            settledLetters.add(letter);
            for (const listener of listeners) listener();
        });
    inFlight.set(letter, promise);
    return promise;
}

/**
 * Whether a slug is ready, still loading, or not an icon at all.
 *
 * `"missing"` is only reported once that is actually knowable: either lucide has
 * no icons under that initial letter, or the letter's shard already settled
 * without the slug in it.
 *
 * @param slug - Any icon slug, canonical or deprecated.
 * @returns The slug's resolution state.
 */
export function iconStatus(slug: string): "ready" | "loading" | "missing" {
    const canonical = resolveIconAlias(slug);
    if (resolved.has(canonical)) return "ready";
    const letter = canonical[0] ?? "";
    if (!shardLoaders[letter]) return "missing";
    return settledLetters.has(letter) ? "missing" : "loading";
}

/**
 * Warm the cache for slugs you know you are about to render.
 *
 * Useful right before opening a menu or a picker: the shards land while the user
 * is still reaching for it, so nothing flashes a fallback.
 *
 * @param slugs - Icon slugs to preload.
 * @returns A promise that settles when every needed shard is in the cache.
 */
export async function preloadIcons(slugs: readonly string[]): Promise<void> {
    await Promise.all(slugs.map(loadIcon));
}

/**
 * Subscribe to shard arrivals.
 *
 * @param listener - Called after each shard lands.
 * @returns An unsubscribe function.
 */
export function subscribeToIcons(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

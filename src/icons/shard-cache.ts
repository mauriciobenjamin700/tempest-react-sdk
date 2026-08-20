import type { LucideIcon } from "lucide-react";

import { isDevBuild } from "../utils/dev-mode";
import { iconAliases } from "./generated/aliases";
import { iconShards, type IconShard } from "./generated/loaders";

/**
 * Slugs resolved so far, across every shard already fetched.
 *
 * Module-level and readable **synchronously**, which is the whole point: once a
 * page has rendered one icon, every other icon in that shard's range is already in
 * memory and paints on its first frame. A cache that could only be read from an
 * effect would flash a fallback for each new icon, which is the behavior
 * `lucide-react`'s own `DynamicIcon` has.
 */
const resolved = new Map<string, LucideIcon>();

/** In-flight shard fetches, so N icons from one shard trigger one import. */
const inFlight = new Map<string, Promise<void>>();

/**
 * Find the shard that owns a slug.
 *
 * The shards are contiguous, sorted ranges, so this is a binary search over their
 * lower bounds — 45 entries in the index rather than the 2000-entry slug→chunk map
 * that costs 120 KB in a main chunk.
 *
 * A slug sorting before the first range belongs to no shard, which is knowable
 * without any fetch: `"0-not-an-icon"` cannot be a lucide name.
 *
 * @param canonical - A canonical slug, aliases already resolved.
 * @returns The owning shard, or `undefined` when no range can hold it.
 */
function shardFor(canonical: string): IconShard | undefined {
    if (canonical === "" || canonical < iconShards[0].from) return undefined;

    let low = 0;
    let high = iconShards.length - 1;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (iconShards[mid].from <= canonical) low = mid;
        else high = mid - 1;
    }
    return iconShards[low];
}

/**
 * Shard ids whose chunk actually arrived.
 *
 * Needed to tell "still loading" from "no such icon": until the shard arrives,
 * absence from `resolved` proves nothing. Only once the shard is in here does a
 * missing slug mean the name is genuinely wrong — which is what lets `Icon` warn
 * about a typo without also warning on every icon mid-flight.
 *
 * A shard that *failed* deliberately does not land here. Collapsing "the chunk
 * 404'd" into "no such icon" is what made a stale deploy look like a typo.
 */
const loadedShards = new Set<string>();

/**
 * Shards whose fetch gave up, and when.
 *
 * The timestamp is what stops a permanent fallback: `useIcon` re-runs its effect
 * on every miss, so a shard is retried on a later render — after a cooldown, so a
 * chunk that is genuinely gone cannot turn into a request loop.
 */
const failedShards = new Map<string, number>();

/**
 * Backoff before each retry, in milliseconds.
 *
 * Two retries, both fast, because the failure this exists for is a transient one:
 * a flaky connection, or a chunk whose CDN edge has not caught up. A 404 from a
 * deploy that rotated hashed filenames is *not* fixed by retrying — for that, the
 * error subscription is the signal, and the app reloads.
 */
const RETRY_DELAYS = [100, 400] as const;

/** How long a failed shard is left alone before another render may retry it. */
const RETRY_COOLDOWN_MS = 10_000;

/** What a shard failure reports to whoever subscribed. */
export interface IconLoadError {
    /** The shard key whose chunk could not be fetched. */
    shard: string;
    /** The slug whose render asked for it. */
    slug: string;
    /** Attempts made before giving up, retries included. */
    attempts: number;
    /** The last rejection from the dynamic import. */
    error: unknown;
}

/** Callbacks to run when a shard fetch gives up. */
const errorListeners = new Set<(detail: IconLoadError) => void>();

/** Callbacks to run after a shard lands, so mounted `<Icon>`s re-render. */
const listeners = new Set<() => void>();

/**
 * Map a slug to the canonical slug that owns the icon.
 *
 * Lucide keeps 257 deprecated aliases (`alert-circle` → `circle-alert`), and a
 * slug persisted in a database years ago is exactly the case this feature exists
 * for, so an alias must keep resolving after a lucide bump renames it. Resolution
 * happens before the shard lookup, since only canonical slugs are sharded.
 *
 * @param slug - Any icon slug, canonical or deprecated.
 * @returns The canonical slug.
 */
export function resolveIconAlias(slug: string): string {
    return iconAliases[slug] ?? slug;
}

/**
 * Make icon components resolvable by slug, with no provider and no plugin.
 *
 * Call it once from an entrypoint. The icons land in the same table a fetched
 * shard fills, so every `<Icon>` below — including one that renders before the
 * call, since registering notifies subscribers — resolves them synchronously and
 * never issues a request.
 *
 * This is the whole setup for a closed catalog: an admin panel with twenty known
 * icons pays two lines instead of a build plugin plus a provider. `IconProvider`
 * stays for what is genuinely tree-scoped — the `size`/`strokeWidth` defaults and
 * a registry that must override the global one for one subtree.
 *
 * A slug lucide does not ship is registered as-is, which is how an app adds its
 * own artwork to the same `<Icon name>` call site.
 *
 * @example
 * import { registerIcons } from "tempest-react-sdk/icons";
 * import { Save, Trash2 } from "lucide-react";
 *
 * registerIcons({ save: Save, "trash-2": Trash2 });
 *
 * @param icons - Slug → icon component. Deprecated slugs are stored under the
 *   canonical name, so both spellings resolve.
 */
export function registerIcons(icons: Readonly<Record<string, LucideIcon>>): void {
    let changed = false;
    for (const [slug, icon] of Object.entries(icons)) {
        const canonical = resolveIconAlias(slug);
        if (resolved.get(canonical) === icon) continue;
        resolved.set(canonical, icon);
        changed = true;
    }
    if (!changed) return;
    for (const listener of listeners) listener();
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

    const shard = shardFor(canonical);
    if (!shard) return Promise.resolve();

    const pending = inFlight.get(shard.id);
    if (pending) return pending;

    const failedAt = failedShards.get(shard.id);
    if (failedAt !== undefined && performance.now() - failedAt < RETRY_COOLDOWN_MS) {
        return Promise.resolve();
    }

    const promise = fetchShard(shard, canonical).finally(() => {
        inFlight.delete(shard.id);
        for (const listener of listeners) listener();
    });
    inFlight.set(shard.id, promise);
    return promise;
}

/**
 * Fetch one shard, retrying a couple of times before giving up.
 *
 * Never rejects: an icon whose chunk did not arrive is a rendering outcome, not a
 * programming mistake, so the caller keeps showing its fallback. What it does
 * instead of swallowing the failure is record it — so `iconStatus` can say
 * `"error"` rather than lying with `"missing"` — and report it to whoever
 * subscribed.
 *
 * @param shard - The shard being fetched.
 * @param slug - The canonical slug whose render asked for it, for the report.
 * @returns A promise that settles once the attempts are done.
 */
async function fetchShard(shard: IconShard, slug: string): Promise<void> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
        try {
            const mod = await shard.load();
            for (const [name, icon] of Object.entries(mod.default)) resolved.set(name, icon);
            loadedShards.add(shard.id);
            failedShards.delete(shard.id);
            return;
        } catch (error) {
            lastError = error;
            const backoff = RETRY_DELAYS[attempt];
            if (backoff === undefined) break;
            await sleep(backoff);
        }
    }

    failedShards.set(shard.id, performance.now());
    reportIconLoadError({
        shard: shard.id,
        slug,
        attempts: RETRY_DELAYS.length + 1,
        error: lastError,
    });
}

/**
 * Wait, as a promise.
 *
 * @param ms - Delay in milliseconds.
 * @returns A promise resolved after the delay.
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Hand a shard failure to whoever is listening.
 *
 * With no subscriber the failure would be silent, which is the state this
 * replaces — so in a dev build it warns instead. An app that wired the
 * subscription up owns the reporting from then on and gets no console noise.
 *
 * @param detail - What failed.
 */
function reportIconLoadError(detail: IconLoadError): void {
    if (errorListeners.size === 0) {
        if (isDevBuild()) warnShardFailure(detail);
        return;
    }
    for (const listener of errorListeners) listener(detail);
}

const warnedShards = new Set<string>();

/**
 * Warn once per shard that failed to load.
 *
 * Once, because every `<Icon>` under that letter re-triggers the path and a
 * warning per icon would bury the console.
 *
 * @param detail - What failed.
 */
function warnShardFailure({ shard, slug, attempts }: IconLoadError): void {
    if (warnedShards.has(shard)) return;
    warnedShards.add(shard);
    console.warn(
        `[tempest-react-sdk] icon shard "${shard}" failed to load after ${attempts} attempts ` +
            `(first asked for by "${slug}"). The usual cause is a deploy that rotated hashed ` +
            `chunk names while this tab was open. Subscribe with \`subscribeToIconErrors\` to ` +
            `report it and reload.`,
    );
}

/**
 * Subscribe to shard fetches that gave up.
 *
 * The failure is routine in a long-lived tab: a deploy rotates hashed chunk
 * names, the old asset leaves the CDN, and the next icon that needs it 404s. That
 * used to end in a permanent fallback with no signal — nothing for the user,
 * nothing for observability. Subscribing is what turns it into both.
 *
 * @example
 * import { subscribeToIconErrors } from "tempest-react-sdk/icons";
 *
 * subscribeToIconErrors(({ shard, error }) => {
 *     Sentry.captureException(error, { tags: { iconShard: shard } });
 *     promptReloadForStaleChunks();
 * });
 *
 * @param listener - Called once per shard that gave up.
 * @returns An unsubscribe function.
 */
export function subscribeToIconErrors(listener: (detail: IconLoadError) => void): () => void {
    errorListeners.add(listener);
    return () => errorListeners.delete(listener);
}

/**
 * Whether a slug is ready, loading, unknown, or unreachable.
 *
 * `"missing"` is only reported once that is actually knowable: either lucide has
 * no icons under that initial letter, or the letter's shard **arrived** without
 * the slug in it. A shard that failed to load reports `"error"` instead — the two
 * used to collapse into `"missing"`, which turned a stale deploy into what looked
 * like a typo and made `Icon` warn about a name that is perfectly valid.
 *
 * @param slug - Any icon slug, canonical or deprecated.
 * @returns The slug's resolution state.
 */
export function iconStatus(slug: string): "ready" | "loading" | "missing" | "error" {
    const canonical = resolveIconAlias(slug);
    if (resolved.has(canonical)) return "ready";
    const shard = shardFor(canonical);
    if (!shard) return "missing";
    if (loadedShards.has(shard.id)) return "missing";
    return failedShards.has(shard.id) ? "error" : "loading";
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

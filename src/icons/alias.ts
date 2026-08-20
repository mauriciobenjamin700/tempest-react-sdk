import { iconAliases } from "./generated/aliases";

/**
 * Map a slug to the canonical slug that owns the icon.
 *
 * Lucide keeps 257 deprecated aliases (`alert-circle` → `circle-alert`), and a
 * slug persisted in a database years ago is exactly the case this feature exists
 * for, so an alias must keep resolving after a lucide bump renames it. Resolution
 * happens before the shard lookup, since only canonical slugs are sharded.
 *
 * Its own module, not part of `shard-cache`: everything that merely *names* an
 * icon needs this — `normalizeIconName`, `validateIconName`, a form checking a
 * value before submit — and none of that needs the shard loader index. Sharing a
 * module made a validator that never renders anything drag in all 45 shard
 * modules.
 *
 * @param slug - Any icon slug, canonical or deprecated.
 * @returns The canonical slug.
 */
export function resolveIconAlias(slug: string): string {
    return iconAliases[slug] ?? slug;
}

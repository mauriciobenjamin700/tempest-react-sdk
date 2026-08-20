import { resolveIconAlias } from "./shard-cache";

/**
 * Clean up an icon code and resolve it to the slug lucide actually ships.
 *
 * Every backend that stores an `icon_code` stores it dirty: `snake_case` left over
 * from an old form, a capital or a stray space from a hand-typed value, and slugs
 * lucide has since deprecated. Each app was writing the same three-step cleanup
 * before rendering — trim, lower-case, `_` → `-`, then `resolveIconAlias` — which
 * is code that should not exist outside the SDK.
 *
 * Note that this does **not** check whether the result is a real icon: the point is
 * to produce the canonical spelling, and deciding what to do with an unknown name
 * belongs to the caller. Pair it with `isIconName` when you need that answer, or
 * let `<Icon>` render its `fallback`.
 *
 * @example
 * normalizeIconName("  Alert_Circle ");  // "circle-alert"
 * normalizeIconName("shopping_cart");    // "shopping-cart"
 *
 * @param code - Any stored icon code.
 * @returns The canonical, lucide-spelled slug.
 */
export function normalizeIconName(code: string): string {
    return resolveIconAlias(code.trim().toLowerCase().replaceAll("_", "-"));
}

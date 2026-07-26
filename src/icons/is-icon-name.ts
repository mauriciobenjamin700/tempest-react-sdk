import type { IconName } from "./generated/icon-name";
import { iconNames } from "./generated/icon-names";

const known: ReadonlySet<string> = new Set(iconNames);

/**
 * Narrow an arbitrary string to a known icon slug.
 *
 * Use it at the edge where untrusted names arrive — an API response, a CMS field,
 * a URL parameter — so the rest of the code works with `IconName` and a bad value
 * is handled once, where you can decide what to show instead.
 *
 * Note that this imports the full slug list (~6 KB brotli). `<Icon>` alone does
 * not, so only reach for this when you genuinely need to validate.
 *
 * @example
 * const slug = isIconName(row.icon) ? row.icon : "circle-help";
 *
 * @param value - Any string.
 * @returns `true` when `value` is a slug lucide ships, alias included.
 */
export function isIconName(value: string): value is IconName {
    return known.has(value);
}

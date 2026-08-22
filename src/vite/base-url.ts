/**
 * The resolved Vite `base` as a prefix that always ends in a slash.
 *
 * One rule, three call sites: the manifest prefixes the URLs it precaches, and
 * the dev middleware matches the paths the browser asks for. They have to agree
 * by definition — when they drift, dev serves `/app/sw.js` while the manifest
 * precached `/sw.js`, and the symptom only appears on a subpath deploy, which is
 * the least exercised configuration there is.
 *
 * @param base - Vite's resolved `base`, with or without a trailing slash.
 * @returns The same base, guaranteed to end in `/`.
 */
export function basePrefix(base: string): string {
    return base.endsWith("/") ? base : `${base}/`;
}

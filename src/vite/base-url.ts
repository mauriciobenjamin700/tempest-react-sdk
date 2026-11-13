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

/**
 * The output file a root-absolute URL resolves to, relative to `outDir`.
 *
 * Emitted files are named relative to the build output, while the options that
 * point at them (`swUrl`, `additionalUrls`) are URLs that may or may not carry
 * the base. Both spellings land on the same file, so a check that a URL was
 * emitted does not depend on which one the config used.
 *
 * @param base - Vite's resolved `base`.
 * @param url - A root-absolute URL, with or without the base.
 * @returns The path of the file under `outDir`, without a leading slash.
 */
export function toOutputFile(base: string, url: string): string {
    const prefix = basePrefix(base);
    const path = url.split(/[?#]/)[0];
    if (prefix !== "/" && path.startsWith(prefix)) return path.slice(prefix.length);
    return path.replace(/^\/+/, "");
}

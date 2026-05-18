/**
 * Convert a string into a URL-safe slug.
 *
 * - Strips accents/diacritics.
 * - Lowercases.
 * - Replaces non-alphanumeric runs with `-`.
 * - Trims leading/trailing separators.
 *
 * @example
 * slugify("São Paulo / Centro"); // "sao-paulo-centro"
 */
export function slugify(input: string): string {
    return input
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Truncate a string to `max` characters, appending `suffix` when cut.
 * Returns the original when shorter than (or equal to) `max`.
 *
 * @example
 * truncate("The quick brown fox", 12);              // "The quick…"
 * truncate("The quick brown fox", 12, " (more)");   // "The qu (more)"
 */
export function truncate(input: string, max: number, suffix: string = "…"): string {
    if (input.length <= max) return input;
    const cut = Math.max(0, max - suffix.length);
    return input.slice(0, cut).trimEnd() + suffix;
}

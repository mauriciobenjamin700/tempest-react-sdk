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

/**
 * Uppercase the first character of `value`, leaving the rest untouched.
 *
 * @example
 * capitalize("hello world"); // "Hello world"
 * capitalize("");            // ""
 */
export function capitalize(value: string): string {
    if (value.length === 0) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Convert `value` to `camelCase`.
 *
 * Splits on spaces, hyphens, underscores and other non-alphanumeric runs,
 * lowercases the first word, and capitalizes each subsequent word.
 *
 * @example
 * camelCase("hello world");   // "helloWorld"
 * camelCase("foo-bar_baz");   // "fooBarBaz"
 * camelCase("API response");  // "apiResponse"
 */
export function camelCase(value: string): string {
    const words = value
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0) return "";
    return words
        .map((word, index) => {
            const lower = word.toLowerCase();
            return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join("");
}

/**
 * Convert `value` to `kebab-case`.
 *
 * Splits camelCase boundaries and non-alphanumeric runs, then joins with `-`
 * and lowercases.
 *
 * @example
 * kebabCase("helloWorld");   // "hello-world"
 * kebabCase("foo_bar baz");  // "foo-bar-baz"
 * kebabCase("APIResponse");  // "api-response"
 */
export function kebabCase(value: string): string {
    return value
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
}

/**
 * Pick the singular or plural form of a word based on `count`.
 *
 * Returns only the word (never the count). When `plural` is omitted it defaults
 * to `singular + "s"`.
 *
 * @example
 * pluralize(1, "item");            // "item"
 * pluralize(3, "item");            // "items"
 * pluralize(2, "person", "people"); // "people"
 */
export function pluralize(count: number, singular: string, plural?: string): string {
    return count === 1 ? singular : (plural ?? `${singular}s`);
}

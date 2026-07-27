/**
 * URL vetting for links and images in rendered Markdown.
 *
 * This is the security boundary of the whole component. Markdown that arrives from
 * a user — a comment, a ticket description, a review — reaches the DOM as a real
 * `href`, and `javascript:alert(1)` in a link is script execution on click. So the
 * scheme is checked against an allowlist rather than a blocklist: a blocklist has
 * to enumerate `javascript:`, `JaVaScRiPt:`, `java\tscript:`, `&#106;avascript:`
 * and whatever comes next, and misses the one nobody thought of.
 */

/** Schemes a link may use. Anything else is dropped. */
const LINK_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:", "sms:"]);

/**
 * Image `data:` types that are safe to inline.
 *
 * `svg+xml` is deliberately absent: an SVG is a document, it can carry `<script>`
 * and event handlers, and browsers execute them when it loads from a `data:` URL in
 * some contexts. The raster formats cannot carry code.
 */
const IMAGE_DATA_TYPES = /^data:image\/(png|jpe?g|gif|webp|avif|bmp);base64,[a-z0-9+/=\s]+$/i;

/**
 * Strip the characters a scheme can be smuggled through.
 *
 * `java\tscript:` and `java\nscript:` are both parsed as `javascript:` by browsers,
 * and a leading control character defeats a naive `startsWith` check.
 */
function normalize(raw: string): string {
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    return raw.replace(/[\u0000-\u0020\u007F]/g, "").trim();
}

/**
 * The href to render, or `null` when the URL must not be linked.
 *
 * Relative URLs (`/docs`, `./x`, `#anchor`, `foo/bar`) are kept: they cannot carry
 * a scheme, so they cannot execute anything, and dropping them would break every
 * in-app link.
 *
 * @param raw - URL as written in the Markdown.
 * @returns A safe href, or `null`.
 */
export function safeLinkUrl(raw: string): string | null {
    const url = normalize(raw);
    if (!url) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
        const scheme = url.slice(0, url.indexOf(":") + 1).toLowerCase();
        return LINK_SCHEMES.has(scheme) ? url : null;
    }
    // Protocol-relative (`//host/path`) inherits the page scheme — safe, and real.
    return url;
}

/**
 * The `src` to render for an image, or `null`.
 *
 * @param raw - URL as written in the Markdown.
 * @returns A safe src, or `null`.
 */
export function safeImageUrl(raw: string): string | null {
    const url = normalize(raw);
    if (!url) return null;
    if (IMAGE_DATA_TYPES.test(url)) return url;
    if (/^data:/i.test(url)) return null;
    return safeLinkUrl(url);
}

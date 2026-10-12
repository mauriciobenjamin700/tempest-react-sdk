/**
 * URL vetting for every `href` and `src` the SDK fills from somebody else's data:
 * links and images in rendered Markdown, and the file row of a chat attachment.
 *
 * This is a security boundary. Text that arrives from a user — a comment, a ticket
 * description, a chat attachment — reaches the DOM as a real `href`, and
 * `javascript:alert(1)` in a link is script execution on click. React 19 replaces
 * a `javascript:` href with a throwing stub, but the peer range admits React 18,
 * which only warns: measured with react-dom 18.3.1, `renderToStaticMarkup` wrote
 * `href="javascript:..."` verbatim, and clicking it ran the script in Chromium 153
 * and Firefox 155 — `download` on the anchor did not stop it (#447). So the
 * scheme is checked against an allowlist rather than a blocklist: a blocklist has
 * to enumerate `javascript:`, `JaVaScRiPt:`, `java\tscript:`, `&#106;avascript:`
 * and whatever comes next, and misses the one nobody thought of.
 */

/** Schemes a link may use. Anything else is dropped. */
const LINK_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:", "sms:"]);

/**
 * Schemes a fetched resource — an attachment, a download — may use.
 *
 * `blob:` is here because an app shows a message while its upload is still in
 * flight by pointing at `URL.createObjectURL(file)`. A blob URL is same-origin
 * bytes the page already holds; it cannot run code by being followed.
 */
const RESOURCE_SCHEMES = new Set(["http:", "https:", "blob:"]);

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
 * The scheme of a normalized URL, lower-cased with its colon, or `null` for a
 * relative URL.
 */
function schemeOf(url: string): string | null {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
    return url.slice(0, url.indexOf(":") + 1).toLowerCase();
}

/**
 * The href to render, or `null` when the URL must not be linked.
 *
 * Relative URLs (`/docs`, `./x`, `#anchor`, `foo/bar`) are kept: they cannot carry
 * a scheme, so they cannot execute anything, and dropping them would break every
 * in-app link. Protocol-relative (`//host/path`) inherits the page scheme and is
 * kept for the same reason.
 *
 * @example
 * safeLinkUrl("https://x.dev"); // "https://x.dev"
 * safeLinkUrl("java\tscript:alert(1)"); // null
 *
 * @param raw - URL as written in the Markdown.
 * @returns A safe href, or `null`.
 */
export function safeLinkUrl(raw: string): string | null {
    const url = normalize(raw);
    if (!url) return null;
    const scheme = schemeOf(url);
    return scheme === null || LINK_SCHEMES.has(scheme) ? url : null;
}

/**
 * The `src` to render for an image, or `null`.
 *
 * Accepts what {@link safeLinkUrl} accepts, plus raster `data:image/...;base64`.
 *
 * @example
 * safeImageUrl("data:image/png;base64,iVBORw0KGgo="); // kept
 * safeImageUrl("data:image/svg+xml;base64,PHN2Zz4="); // null
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

/**
 * The URL to fetch or download an attachment from, or `null`.
 *
 * The allowlist is `http:`, `https:`, `blob:`, relative URLs and the raster
 * `data:image/` types {@link safeImageUrl} accepts. A file row is an `<a href
 * download>`, and the `download` attribute does not stop a `javascript:` href
 * from running (measured in Chromium 153 and Firefox 155, #447), so the scheme
 * has to be checked before the anchor exists. `mailto:`/`tel:` are left out: an
 * attachment is bytes, not a contact.
 *
 * The scheme is judged on the normalized form, but the URL comes back **as given**:
 * normalizing deletes every space, and `/files/relatório final.pdf` is a real
 * attachment path. Returning the original is safe because the normalization only
 * removes characters, a superset of what the browser's URL parser strips, so it
 * can never hide a scheme the browser would see.
 *
 * @example
 * const href = safeAttachmentUrl(attachment.url);
 * return href ? <a href={href} download>{name}</a> : <span>{name}</span>;
 *
 * @param raw - URL as the sender supplied it.
 * @returns A safe URL, or `null` when it must not reach an `href`.
 */
export function safeAttachmentUrl(raw: string): string | null {
    const url = normalize(raw);
    if (!url) return null;
    if (IMAGE_DATA_TYPES.test(url)) return raw;
    const scheme = schemeOf(url);
    return scheme === null || RESOURCE_SCHEMES.has(scheme) ? raw : null;
}

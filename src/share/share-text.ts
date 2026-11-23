/**
 * Fold a link into the message text, once.
 *
 * Two places lose the `url` field of a share: a `wa.me` link has only `text`,
 * and a native share that carries a file hands most targets a caption, not a
 * separate link — so the link has to be inside the text to survive. A text that
 * already contains the link is returned as is, so a message written as
 * `"Reserve: https://…"` does not end with the link twice.
 *
 * Internal: used by `useShare` and by the `wa.me` path of `ShareActions` /
 * `ShareButton`.
 *
 * @param text - The message, possibly empty.
 * @param url - The link to carry, possibly empty.
 * @returns `text` and `url` joined by a line break, or whichever one exists.
 */
export function shareText(text: string | undefined, url: string | undefined): string {
    if (!url) return text ?? "";
    if (!text) return url;
    return text.includes(url) ? text : `${text}\n${url}`;
}

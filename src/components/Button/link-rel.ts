/** Link relationships that `target="_blank"` must carry. */
const BLANK_TARGET_REL: readonly string[] = ["noopener", "noreferrer"];

/**
 * The `rel` to render for a link, adding `noopener noreferrer` to a new-tab link.
 *
 * A page opened with `target="_blank"` and no `noopener` gets `window.opener` and
 * can redirect the tab that opened it. It is a mechanical rule with one right
 * answer, so it lives here instead of in a warning on the docs page. The tokens
 * the consumer passed are kept, and none is added twice (case-insensitively).
 *
 * @param target - The link's `target`.
 * @param rel - The `rel` the consumer passed, if any.
 * @returns The `rel` to render, or `undefined` when there is none.
 */
export function resolveLinkRel(
    target: string | undefined,
    rel: string | undefined,
): string | undefined {
    if (target !== "_blank") return rel;
    const present = ` ${(rel ?? "").toLowerCase().replace(/\s+/g, " ")} `;
    return [rel?.trim(), ...BLANK_TARGET_REL.filter((token) => !present.includes(` ${token} `))]
        .filter(Boolean)
        .join(" ");
}

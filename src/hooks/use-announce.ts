import { useCallback, useEffect } from "react";

/**
 * How urgently a screen reader should interrupt.
 *
 * `"polite"` waits for a pause in what is being read. `"assertive"` cuts in
 * immediately, which is right for an error the user must act on and wrong for
 * everything else — an assertive announcement can truncate the sentence the user
 * was in the middle of.
 */
export type AnnouncePoliteness = "polite" | "assertive";

/** How long an announcement stays in the DOM before it is cleaned up. */
const CLEAR_AFTER_MS = 7_000;

/**
 * Inline styles that hide an element visually while leaving it readable.
 *
 * Inline and not a CSS module on purpose: these nodes are created imperatively by
 * a hook, and a hook that only works when the app remembered to import
 * `tempest-react-sdk/styles.css` would drop two visible, unstyled paragraphs into
 * the page — a visual bug caused by an accessibility feature.
 */
const HIDDEN_STYLE: Partial<CSSStyleDeclaration> = {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    padding: "0",
    border: "0",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
};

interface Regions {
    polite: HTMLElement;
    assertive: HTMLElement;
}

let regions: Regions | null = null;
const timers = new Set<ReturnType<typeof setTimeout>>();

/**
 * Build one live region.
 *
 * The polite region carries `role="status"`; the assertive one carries only
 * `aria-live="assertive"`. `role="alert"` is deliberately **not** used: these
 * regions live in the document for the page's whole life, and an empty element
 * claiming to be an alert is both a lie about its content and a trap for every
 * `getByRole("alert")` in a consuming app's test suite, which would suddenly match
 * two nodes. A bare `aria-live` region is announced by every screen reader that
 * supports live regions at all.
 *
 * @param politeness - Which region to build.
 * @returns The region, already appended to `<body>`.
 */
function createRegion(politeness: AnnouncePoliteness): HTMLElement {
    const node = document.createElement("div");
    if (politeness === "polite") node.setAttribute("role", "status");
    node.setAttribute("aria-live", politeness);
    node.setAttribute("aria-atomic", "true");
    node.setAttribute("data-tempest-announcer", politeness);
    Object.assign(node.style, HIDDEN_STYLE);
    document.body.appendChild(node);
    return node;
}

/**
 * Get the two shared live regions, creating them on first use.
 *
 * **Two regions, not one with a switchable `aria-live`.** Politeness is a property
 * of the region, read when the assistive technology first registers it — flipping
 * the attribute later is honoured by some screen readers, ignored by others, and
 * in the worst case drops the announcement entirely. Two regions that never change
 * are the only version that behaves the same everywhere.
 *
 * **Shared, not one per component.** Every live region on the page is polled;
 * several of them mutating at once is how announcements get dropped or doubled.
 * One pair per document keeps the order deterministic.
 *
 * A pair is replaced as a **pair**, discarding the old one: if only one region was
 * torn out of the DOM (a router that replaced `<body>`, a micro-frontend unmount),
 * keeping its still-attached sibling would leave two regions of that politeness on
 * the page — the exact duplication the shared pair exists to prevent.
 *
 * @returns The polite and assertive regions, or `null` outside a document.
 */
function ensureRegions(): Regions | null {
    if (typeof document === "undefined") return null;
    if (regions && regions.polite.isConnected && regions.assertive.isConnected) return regions;
    regions?.polite.remove();
    regions?.assertive.remove();
    regions = { polite: createRegion("polite"), assertive: createRegion("assertive") };
    return regions;
}

/**
 * Announce a message to screen readers, from anywhere — a hook, an event handler,
 * a plain function outside React.
 *
 * ## Why the same string announces twice
 *
 * Screen readers announce a live region when its **content changes**. Writing the
 * same text again is not a change, so "Item removido" twice in a row is read once —
 * the classic reason these announcers are quietly broken. Instead of mutating text,
 * every call replaces the region's child with a **new element**. The DOM mutation is
 * real even when the string is identical, so the second announcement happens, and
 * the reader hears the exact message with no padding characters bolted on.
 *
 * @param message - Text to read out. Empty strings are ignored.
 * @param politeness - `"polite"` (default) or `"assertive"`.
 *
 * @example
 * announce(`${count} pedidos encontrados`);
 * announce("Falha ao salvar", "assertive");
 */
export function announce(message: string, politeness: AnnouncePoliteness = "polite"): void {
    if (!message) return;
    const pair = ensureRegions();
    if (!pair) return;

    const region = politeness === "assertive" ? pair.assertive : pair.polite;
    region.replaceChildren();
    const item = document.createElement("div");
    item.textContent = message;
    region.appendChild(item);

    const timer = setTimeout(() => {
        timers.delete(timer);
        if (item.isConnected) item.remove();
    }, CLEAR_AFTER_MS);
    timers.add(timer);
}

/**
 * Remove the shared regions and cancel pending cleanups.
 *
 * For test teardown and for a micro-frontend being unmounted from a page it does
 * not own. Regular apps never need it — two empty hidden `div`s cost nothing, and
 * tearing them down while another component still announces would lose messages.
 */
export function clearAnnouncer(): void {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    regions?.polite.remove();
    regions?.assertive.remove();
    regions = null;
}

/**
 * Announce transient messages to screen readers through one shared live region
 * pair.
 *
 * Reach for this when something happened that a sighted user can see and a screen
 * reader user cannot: a filter narrowed a list, a row saved, a copy succeeded, an
 * upload failed. It is **not** for content that is already on screen inside a
 * region with a role — a status pill, a toast that renders as `role="status"`,
 * a form error tied to its input — announcing those again reads them twice.
 *
 * !!! warning "Never wrap streaming text in a live region"
 *     A live region over text that grows token by token makes the reader start the
 *     whole answer again on every token. Announce the **edges** instead — "gerando
 *     resposta" and "resposta concluída" — and leave the transcript in a plain
 *     `role="log"` the user reads at their own pace. `AIChat` does exactly that.
 *
 * Mounting the hook creates the regions even before the first message. That is not
 * tidiness: a live region inserted into the DOM in the same frame as its first
 * content routinely loses that announcement, because the assistive technology has
 * to have registered the region before it can notice a change inside it.
 *
 * @returns A stable `announce(message, politeness?)` function.
 *
 * @example
 * const announce = useAnnounce();
 *
 * function onFilter(rows: Row[]) {
 *     announce(`${rows.length} resultados`);
 * }
 */
export function useAnnounce(): (message: string, politeness?: AnnouncePoliteness) => void {
    useEffect(() => {
        ensureRegions();
    }, []);

    return useCallback(
        (message: string, politeness: AnnouncePoliteness = "polite") =>
            announce(message, politeness),
        [],
    );
}

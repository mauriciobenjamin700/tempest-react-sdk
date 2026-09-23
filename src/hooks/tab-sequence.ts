/** Elements that can take keyboard focus — shared by the focus trap and the portal tab order. */
export const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

/** A portalled panel and the element of the page it was opened from. */
export interface PortalLayer {
    /** Wrapper of the trigger — the spot in the page the panel belongs to. */
    anchor: HTMLElement;
    /** The panel, mounted at the end of `body`. */
    panel: HTMLElement;
}

const layers = new Set<PortalLayer>();

/**
 * Declare a portalled panel as belonging to the spot of its anchor.
 *
 * A portal takes the panel out of the subtree it was opened from, so a focus
 * trap around that subtree would see the panel as "outside" and pull focus away
 * from it. Registered layers are what {@link tabSequence} and
 * {@link tabRegion} splice back in.
 *
 * @param layer - The anchor and the panel.
 * @returns A function that removes the registration.
 */
export function registerPortalLayer(layer: PortalLayer): () => void {
    layers.add(layer);
    return () => {
        layers.delete(layer);
    };
}

/**
 * The elements `Tab` can stop on inside `root`, in document order.
 *
 * @param root - Where to look.
 * @returns The tabbable descendants that are not disabled, hidden or removed
 * from the tab order.
 */
export function tabbables(root: ParentNode): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
        if (el.tabIndex < 0 || el.hasAttribute("aria-hidden")) return false;
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden";
    });
}

/**
 * Split the layers into those opened from inside `root` and the rest.
 *
 * @param root - The subtree the layers are matched against.
 * @param pending - The layers not yet assigned to a subtree.
 * @returns The layers whose anchor lives in `root` (and whose panel does not),
 * and the remaining ones.
 */
function ownedBy(
    root: HTMLElement,
    pending: PortalLayer[],
): { owned: PortalLayer[]; rest: PortalLayer[] } {
    const owned = pending.filter(
        (layer) => root.contains(layer.anchor) && !root.contains(layer.panel),
    );
    return { owned, rest: pending.filter((layer) => !owned.includes(layer)) };
}

/**
 * Every subtree focus may sit in while `root` is trapped: `root` itself plus the
 * panels opened from it, transitively (a popover opened from a popover).
 *
 * @param root - The trapped container.
 * @returns `root` followed by the panels that belong to it.
 */
export function tabRegion(root: HTMLElement): HTMLElement[] {
    const region: HTMLElement[] = [root];
    let pending = [...layers];
    for (let index = 0; index < region.length; index += 1) {
        const { owned, rest } = ownedBy(region[index]!, pending);
        region.push(...owned.map((layer) => layer.panel));
        pending = rest;
    }
    return region;
}

/**
 * The order `Tab` walks inside `root`, with each owned portalled panel spliced
 * right after the last stop of its anchor — where it would sit had it rendered
 * in flow. That is the same order `usePortalTabOrder` restores between the
 * trigger and the panel, so the trap wraps at the same ends the user walks.
 *
 * @param root - The trapped container.
 * @param pending - Layers not yet placed; defaults to every registered one.
 * @returns The tab stops of `root` and of its panels, in walking order.
 */
export function tabSequence(
    root: HTMLElement,
    pending: PortalLayer[] = [...layers],
): HTMLElement[] {
    const native = tabbables(root);
    const { owned, rest } = ownedBy(root, pending);
    const inserted = new Map<number, HTMLElement[]>();
    for (const layer of owned) {
        let at = -1;
        native.forEach((el, index) => {
            const precedes =
                (el.compareDocumentPosition(layer.anchor) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
            if (precedes || layer.anchor.contains(el)) at = index;
        });
        inserted.set(at, [...(inserted.get(at) ?? []), ...tabSequence(layer.panel, rest)]);
    }
    const sequence: HTMLElement[] = [...(inserted.get(-1) ?? [])];
    native.forEach((el, index) => {
        sequence.push(el, ...(inserted.get(index) ?? []));
    });
    return sequence;
}

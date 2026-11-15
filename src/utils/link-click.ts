import type { MouseEvent } from "react";

/**
 * Whether a click on an anchor is the plain one an in-app router should take over.
 *
 * Only a primary-button click without `ctrl`/`meta`/`shift`/`alt` on an anchor
 * that opens in the same browsing context qualifies. Every other click — ctrl- or
 * meta-click for a new tab, shift-click for a new window, alt-click to download,
 * a non-primary button, `target="_blank"` — asks the browser for something the
 * router cannot do, so it stays with the `href`.
 *
 * `target` keywords are ASCII case-insensitive in the HTML spec ("rules for
 * choosing a navigable"), so `_SELF` and `_Self` open in the same context as
 * `_self` and are routed too; matching them case-sensitively would let the
 * browser reload the whole document. A name with surrounding spaces is not
 * trimmed by the browser, so it is a named context and stays with it.
 *
 * @param event The click event the anchor received.
 * @returns `true` when the click should be routed in place.
 */
function isPlainPrimaryClick(event: MouseEvent<HTMLAnchorElement>): boolean {
    if (event.button !== 0) return false;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
    const target = event.currentTarget.getAttribute("target");
    return target === null || target === "" || target.toLowerCase() === "_self";
}

/**
 * Hand a navigation anchor's click to the app instead of the browser.
 *
 * An entry that renders `<a href>` and also reports the selection to the app
 * (`Sidebar`'s `onChange`, `NavigationMenu`'s `onSelect`, `Breadcrumbs`' `onClick`)
 * would otherwise navigate twice on a plain click: the app's router moves, and
 * then the browser follows the `href` and reloads the whole document — dropping
 * every piece of in-memory state, such as an access token kept out of storage
 * (#612). So a plain click is prevented and routed through `route`.
 *
 * A click the browser should keep (see `isPlainPrimaryClick`) is left alone and
 * `route` is **not** called: a ctrl-click opens the link in a new tab, and routing
 * the current tab as well would move the page the user meant to stay on.
 *
 * An anchor without `href` has nothing for the browser to follow, so every click
 * on it goes to `route`. Without `route`, the browser follows the `href`
 * untouched — the entry is plain navigation.
 *
 * @param event The click event the anchor received.
 * @param route What the app does on the click, or `undefined` when it does not
 *     take over the navigation.
 */
export function routeLinkClick(
    event: MouseEvent<HTMLAnchorElement>,
    route: (() => void) | undefined,
): void {
    if (!route) return;
    if (!event.currentTarget.hasAttribute("href")) {
        route();
        return;
    }
    if (!isPlainPrimaryClick(event)) return;
    event.preventDefault();
    route();
}

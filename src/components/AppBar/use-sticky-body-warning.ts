import { useEffect } from "react";

import { isDevBuild } from "../../utils/dev-mode";

/**
 * The one line of the app's own CSS that silently defeats `sticky`.
 *
 * `body { overflow-x: hidden }` is how most apps stop a too-wide child from
 * panning the page sideways. It also, per CSS Overflow 3, forces the computed
 * `overflow-y` to `auto` — a value the author never wrote — which makes the
 * body a **scroll container**. Every sticky descendant then pins to the body's
 * scrollport instead of the viewport, and that scrollport travels with the
 * document: measured in Chromium at 390px with a long page, the bar sat at
 * `top: -900px` after scrolling 900px, i.e. off screen.
 *
 * Nothing about that reads as a CSS problem from the app's side. The bar still
 * reports `position: sticky` in DevTools, the markup is unchanged, and on
 * desktop the screens usually fit without scrolling so the bug never shows. It
 * surfaces on Chrome Android, where the collapsing URL bar makes every screen a
 * scrolling screen — and it gets reported as "the app bar is broken", because
 * that is what the user sees.
 *
 * Hence this warning: the SDK cannot fix it from inside the component (a sticky
 * element has no way to opt out of its scroll container, and a rule the SDK
 * ships in its reset loses to the app's own stylesheet, which is imported
 * after), but it can name the cause in one console line.
 *
 * `clip` is the fix because it clamps the same horizontal overflow without
 * creating a scroll container. It has to be on `html` **and** `body` — with it
 * on only one of them the document still panned to `x: 500` in the same
 * measurement.
 */
const MESSAGE =
    "[tempest-react-sdk] <AppBar sticky /> will not stick: `document.body` has " +
    "`overflow-x: hidden`, which forces its computed `overflow-y` to `auto` and makes the " +
    "body a scroll container. The bar then pins to the body's scrollport instead of the " +
    "viewport and scrolls off the top with the content — most visibly on Chrome Android. " +
    "Fix: `html, body { overflow-x: clip }`, on both elements, since neither clamps alone. " +
    "Pass `sticky={false}` if the bar is meant to scroll away.";

/** Set once the warning has been printed, so re-renders do not bury the console. */
let warned = false;

/**
 * Reset the warn-once latch. Test-only — the latch is module state, and a suite
 * that renders more than one bar would otherwise see the warning only once.
 */
export function resetStickyBodyWarning(): void {
    warned = false;
}

/**
 * Warn once, in development, when the page's own CSS will keep a sticky bar
 * from sticking.
 *
 * Reads the body's `overflow-x` rather than walking the ancestors, because that
 * single declaration is the whole failure mode: an app that genuinely wants the
 * body to scroll writes `overflow-y: auto` itself, and a sticky bar inside a
 * scroll container the app chose on purpose behaves exactly as intended. What
 * is never intentional is acquiring that scroll container as a side effect of
 * clamping the other axis.
 *
 * @param enabled - Whether the bar is actually sticky. A bar rendered with
 *   `sticky={false}` has nothing to lose and stays quiet.
 */
export function useStickyBodyWarning(enabled: boolean): void {
    useEffect(() => {
        if (!enabled || warned || !isDevBuild()) return;
        if (typeof document === "undefined" || !document.body) return;
        if (getComputedStyle(document.body).overflowX !== "hidden") return;
        warned = true;
        console.warn(MESSAGE);
    }, [enabled]);
}

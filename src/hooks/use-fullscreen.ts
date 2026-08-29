import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";
import { getFullscreenElement, useFullscreenElement } from "./use-fullscreen-element";

/**
 * The fullscreen members of `document` this hook calls, standard and
 * vendor-prefixed, every one of them optional.
 *
 * `lib.dom` declares the standard members as always present, which is a promise
 * the runtime does not keep: an older WebKit ships only the prefixed pair, and a
 * document inside an `<iframe>` without `allowfullscreen` reports
 * `fullscreenEnabled: false`. Reading through an all-optional shape is what makes
 * `typeof x === "function"` a check the compiler agrees is worth making.
 */
interface FullscreenDocument {
    fullscreenEnabled?: boolean;
    exitFullscreen?: () => Promise<void>;
    webkitFullscreenEnabled?: boolean;
    webkitExitFullscreen?: () => Promise<void> | void;
}

/** The fullscreen members of an element, standard and vendor-prefixed. */
interface FullscreenTarget {
    requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void> | void;
}

/**
 * Resolve which element the hook acts on.
 *
 * `ref.current` when a ref was given, `document.documentElement` when it was not
 * — the whole page, which is what "go fullscreen" means with no element named.
 *
 * A missing `ref.current` deliberately resolves to `null` rather than falling
 * back to the page: a caller who named an element and whose element is not
 * mounted yet wants an error, not the entire document blown up to fill the
 * screen behind their video.
 *
 * @param ref - The element to present, or `undefined` for the whole page.
 * @returns The element, or `null` when there is nothing to act on.
 */
function resolveTarget(ref?: RefObject<HTMLElement | null>): HTMLElement | null {
    if (typeof document === "undefined") return null;
    return ref ? ref.current : document.documentElement;
}

/**
 * Whether this environment can present anything fullscreen at all.
 *
 * Two independent reasons for `false`, and skipping either one ships a button
 * that does nothing when pressed: the API can be missing (older WebKit, and every
 * browser on iOS for non-`<video>` elements), or present and **disabled** — a
 * document inside an `<iframe>` without the `allowfullscreen` attribute exposes
 * `requestFullscreen` and rejects every call to it, which `fullscreenEnabled`
 * reports up front.
 *
 * An engine that exposes the methods and no flag at all is treated as capable:
 * the flag is the newer half of the API, so its absence says nothing.
 *
 * @returns `true` when a fullscreen request stands a chance of being honoured.
 */
export function isFullscreenSupported(): boolean {
    if (typeof document === "undefined") return false;
    const root: FullscreenTarget = document.documentElement;
    const doc: FullscreenDocument = document;
    const reachable =
        typeof root.requestFullscreen === "function" ||
        typeof root.webkitRequestFullscreen === "function";
    return reachable && (doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? true);
}

/** Value returned by {@link useFullscreen}. */
export interface UseFullscreenResult {
    /** Whether the target element is the one the browser is presenting right now. */
    isFullscreen: boolean;
    /** Whether a request stands a chance at all — hide the control when `false`. */
    supported: boolean;
    /** Present the target. Must be called from a user gesture. Rejects if refused. */
    enter: () => Promise<void>;
    /** Leave fullscreen. Resolves immediately when nothing is presented. */
    exit: () => Promise<void>;
    /** Leave if the target is presented, otherwise enter. Same gesture rule as `enter`. */
    toggle: () => Promise<void>;
}

/**
 * Drive an immersive mode whose state stays true to the browser.
 *
 * The mistake this exists to remove is storing `isFullscreen` in state and
 * flipping it inside your own `enter()` / `exit()`. Fullscreen ends in ways your
 * code never sees — `Esc`, the browser's own exit affordance, F11 pressed while an
 * API fullscreen is active — and each of those leaves the flag saying "sair" over
 * a page that is already windowed. The only honest source is the
 * `fullscreenchange` event, which fires for every one of them, so that is what
 * this hook reads and what the returned `isFullscreen` reflects. The action
 * callbacks never touch it.
 *
 * The subscription is not this hook's own: it lives in `useFullscreenElement`,
 * shared with `usePortalHost`, which needs the same fact to decide where an
 * overlay mounts while fullscreen is on. Two independent listeners for one event
 * would mean two copies of the WebKit prefix dance and two places to fix the next
 * quirk, so the primitive answers "which element is presented" once and each
 * consumer asks its own question of the answer.
 *
 * WebKit's prefixed members are handled throughout — `webkitfullscreenchange`,
 * `webkitFullscreenElement`, `webkitRequestFullscreen`, `webkitExitFullscreen` —
 * because Safari on iPad still ships them and nothing else.
 *
 * `isFullscreen` is identity against the target, not containment: a `<video>`
 * inside your element going fullscreen on its own is not your element being
 * presented, and reporting `true` there would put your exit control inside a
 * subtree the browser is not painting.
 *
 * @param ref - The element to present. Omit it to present the whole page
 * (`document.documentElement`).
 * @returns `{ isFullscreen, supported, enter, exit, toggle }`.
 * @throws Nothing during render. `enter()` and `toggle()` reject with the
 * browser's own error when the request is refused — most often a `TypeError`
 * because the call did not come from a user gesture — and with an `Error` when
 * there is no element to present or the environment ships no Fullscreen API.
 *
 * @example
 * const stage = useRef<HTMLDivElement>(null);
 * const { isFullscreen, supported, toggle } = useFullscreen(stage);
 *
 * <div ref={stage}>
 *   <video src="/aula.mp4" controls />
 *   {supported ? (
 *     <button onClick={() => void toggle().catch(() => setRefused(true))}>
 *       {isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
 *     </button>
 *   ) : null}
 * </div>
 */
export function useFullscreen(ref?: RefObject<HTMLElement | null>): UseFullscreenResult {
    const element = useFullscreenElement();
    const [supported] = useState(isFullscreenSupported);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const target = resolveTarget(ref);
        setIsFullscreen(target !== null && element === target);
    }, [element, ref]);

    const enter = useCallback(async (): Promise<void> => {
        const target = resolveTarget(ref);
        if (target === null) {
            throw new Error(
                "useFullscreen: nothing to present. Either this environment has no document, " +
                    "or the ref was never attached to a mounted element.",
            );
        }
        const candidate: FullscreenTarget = target;
        if (typeof candidate.requestFullscreen === "function") {
            await candidate.requestFullscreen();
            return;
        }
        if (typeof candidate.webkitRequestFullscreen === "function") {
            await candidate.webkitRequestFullscreen();
            return;
        }
        throw new Error("useFullscreen: this browser exposes no way to enter fullscreen.");
    }, [ref]);

    const exit = useCallback(async (): Promise<void> => {
        if (getFullscreenElement() === null) return;
        const doc: FullscreenDocument = document;
        if (typeof doc.exitFullscreen === "function") {
            await doc.exitFullscreen();
            return;
        }
        if (typeof doc.webkitExitFullscreen === "function") {
            await doc.webkitExitFullscreen();
            return;
        }
        throw new Error("useFullscreen: this browser exposes no way to leave fullscreen.");
    }, []);

    const toggle = useCallback(async (): Promise<void> => {
        const target = resolveTarget(ref);
        if (target !== null && getFullscreenElement() === target) {
            await exit();
            return;
        }
        await enter();
    }, [enter, exit, ref]);

    return { isFullscreen, supported, enter, exit, toggle };
}

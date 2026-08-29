import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFullscreenElement } from "./use-fullscreen-element";
import { isFullscreenSupported, useFullscreen } from "./use-fullscreen";

/**
 * Fullscreen members these tests define and must therefore take back off again.
 *
 * jsdom implements none of the Fullscreen API — no `fullscreenElement`, no
 * `fullscreenEnabled`, no `requestFullscreen`, no `fullscreenchange` — so every
 * case here builds the exact slice it needs. Leaving one behind would hand the
 * next test a browser it did not ask for, and the untouched jsdom default is
 * itself a case under test (`supported: false`).
 */
const DOCUMENT_MEMBERS: readonly string[] = [
    "fullscreenElement",
    "webkitFullscreenElement",
    "fullscreenEnabled",
    "webkitFullscreenEnabled",
    "exitFullscreen",
    "webkitExitFullscreen",
];

/** Fullscreen members defined on `HTMLElement.prototype` by these tests. */
const ELEMENT_MEMBERS: readonly string[] = ["requestFullscreen", "webkitRequestFullscreen"];

/**
 * Define a property the way a browser would expose it — present, replaceable and
 * removable again in the teardown.
 *
 * @param host - The object to define the member on.
 * @param property - Member name.
 * @param value - Value the member should report.
 * @returns Nothing.
 */
function define(host: object, property: string, value: unknown): void {
    Object.defineProperty(host, property, { value, configurable: true, writable: true });
}

/**
 * Pretend the browser is presenting an element fullscreen.
 *
 * @param element - The element being presented, or `null` to leave fullscreen.
 * @param options - `prefixed` writes `webkitFullscreenElement` and dispatches
 * `webkitfullscreenchange` instead of the standard pair, which is the only pair
 * older Safari answers to.
 * @returns Nothing.
 */
function setFullscreenElement(element: Element | null, options: { prefixed?: boolean } = {}): void {
    const property = options.prefixed ? "webkitFullscreenElement" : "fullscreenElement";
    const event = options.prefixed ? "webkitfullscreenchange" : "fullscreenchange";
    define(document, property, element);
    act(() => {
        document.dispatchEvent(new Event(event));
    });
}

/**
 * A `requestFullscreen` that behaves like the real one: it presents the element
 * it was called on **and** fires the event, which is what the hook actually reads.
 *
 * @returns A resolved promise, the way the browser's own call does.
 */
function grantFullscreen(this: Element): Promise<void> {
    define(document, "fullscreenElement", this);
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
}

/**
 * An `exitFullscreen` that clears the element and fires the event.
 *
 * @returns A resolved promise.
 */
function releaseFullscreen(): Promise<void> {
    define(document, "fullscreenElement", null);
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
}

/**
 * Append a fresh element to the document, the way a rendered stage would be.
 *
 * @returns The mounted element.
 */
function mountStage(): HTMLDivElement {
    const element = document.createElement("div");
    document.body.append(element);
    return element;
}

/**
 * A ref object holding an element, without a component to own it.
 *
 * `useFullscreen` only ever reads `.current`, so a plain object is the honest
 * stand-in and keeps the ref identity stable across renders — which a literal
 * written inside the `renderHook` callback would not.
 *
 * @param element - The element the ref points at, or `null` for a ref that was
 * never attached.
 * @returns The ref object.
 */
function refTo(element: HTMLElement | null): RefObject<HTMLElement | null> {
    return { current: element };
}

afterEach(() => {
    vi.unstubAllGlobals();
    for (const member of DOCUMENT_MEMBERS) Reflect.deleteProperty(document, member);
    for (const member of ELEMENT_MEMBERS) Reflect.deleteProperty(HTMLElement.prototype, member);
    vi.restoreAllMocks();
});

describe("useFullscreen — state follows the browser", () => {
    it("reports false while nothing is fullscreen", () => {
        const { result } = renderHook(() => useFullscreen());

        expect(result.current.isFullscreen).toBe(false);
    });

    it("reports true once the referenced element becomes the fullscreen element", () => {
        const stage = mountStage();
        const ref = refTo(stage);
        const { result } = renderHook(() => useFullscreen(ref));
        expect(result.current.isFullscreen).toBe(false);

        setFullscreenElement(stage);

        expect(result.current.isFullscreen).toBe(true);
    });

    it("an exit the hook never made still clears the state", async () => {
        const stage = mountStage();
        const exitFullscreen = vi.fn(releaseFullscreen);
        define(document, "exitFullscreen", exitFullscreen);
        define(HTMLElement.prototype, "requestFullscreen", grantFullscreen);
        const { result } = renderHook(() => useFullscreen(refTo(stage)));

        await act(async () => {
            await result.current.enter();
        });
        expect(result.current.isFullscreen).toBe(true);

        setFullscreenElement(null);

        expect(result.current.isFullscreen).toBe(false);
        expect(exitFullscreen).not.toHaveBeenCalled();
    });

    it("stays false when a different element is fullscreen", () => {
        const mine = mountStage();
        const theirs = mountStage();
        const { result } = renderHook(() => useFullscreen(refTo(mine)));

        setFullscreenElement(theirs);

        expect(result.current.isFullscreen).toBe(false);
    });

    it("drops both listeners on unmount", () => {
        const added = vi.spyOn(document, "addEventListener");
        const removed = vi.spyOn(document, "removeEventListener");

        const { unmount } = renderHook(() => useFullscreen());
        expect(added).toHaveBeenCalledWith("fullscreenchange", expect.any(Function));
        expect(added).toHaveBeenCalledWith("webkitfullscreenchange", expect.any(Function));

        unmount();

        expect(removed).toHaveBeenCalledWith("fullscreenchange", expect.any(Function));
        expect(removed).toHaveBeenCalledWith("webkitfullscreenchange", expect.any(Function));
    });

    it("follows webkitfullscreenchange when the standard event never fires", () => {
        const stage = mountStage();
        const { result } = renderHook(() => useFullscreen(refTo(stage)));

        setFullscreenElement(stage, { prefixed: true });

        expect(result.current.isFullscreen).toBe(true);
    });
});

describe("useFullscreen — capability check", () => {
    it("reports supported: false when neither request method exists", () => {
        expect(isFullscreenSupported()).toBe(false);

        const { result } = renderHook(() => useFullscreen());

        expect(result.current.supported).toBe(false);
    });

    it("reports supported: false inside an iframe with fullscreenEnabled false", () => {
        define(HTMLElement.prototype, "requestFullscreen", () => Promise.resolve());
        define(document, "fullscreenEnabled", false);

        expect(isFullscreenSupported()).toBe(false);
    });

    it("honours the prefixed enabled flag when the standard one is missing", () => {
        define(HTMLElement.prototype, "webkitRequestFullscreen", () => Promise.resolve());
        define(document, "webkitFullscreenEnabled", false);

        expect(isFullscreenSupported()).toBe(false);
    });

    it("reports supported: true when only the webkit method exists", () => {
        define(HTMLElement.prototype, "webkitRequestFullscreen", () => Promise.resolve());

        expect(isFullscreenSupported()).toBe(true);

        const { result } = renderHook(() => useFullscreen());

        expect(result.current.supported).toBe(true);
    });
});

describe("useFullscreen — actions", () => {
    it("targets document.documentElement when no ref is given", async () => {
        define(HTMLElement.prototype, "requestFullscreen", grantFullscreen);
        const { result } = renderHook(() => useFullscreen());

        await act(async () => {
            await result.current.enter();
        });

        expect(getFullscreenElement()).toBe(document.documentElement);
        expect(result.current.isFullscreen).toBe(true);
    });

    it("enters through webkitRequestFullscreen when requestFullscreen is absent", async () => {
        const stage = mountStage();
        const request = vi.fn(() => Promise.resolve());
        define(HTMLElement.prototype, "webkitRequestFullscreen", request);
        const { result } = renderHook(() => useFullscreen(refTo(stage)));

        await act(async () => {
            await result.current.enter();
        });

        expect(request).toHaveBeenCalledTimes(1);
    });

    it("exits through webkitExitFullscreen when exitFullscreen is absent", async () => {
        const stage = mountStage();
        const webkitExit = vi.fn(() => Promise.resolve());
        define(document, "webkitExitFullscreen", webkitExit);
        const { result } = renderHook(() => useFullscreen(refTo(stage)));
        setFullscreenElement(stage);

        await act(async () => {
            await result.current.exit();
        });

        expect(webkitExit).toHaveBeenCalledTimes(1);
    });

    it("rejects with the browser's error when requestFullscreen is refused outside a gesture", async () => {
        const stage = mountStage();
        define(HTMLElement.prototype, "requestFullscreen", () =>
            Promise.reject(new TypeError("Permissions check failed")),
        );
        const { result } = renderHook(() => useFullscreen(refTo(stage)));

        await expect(result.current.enter()).rejects.toThrow(TypeError);
        expect(result.current.isFullscreen).toBe(false);
    });

    it("rejects when the referenced element is not mounted", async () => {
        const { result } = renderHook(() => useFullscreen(refTo(null)));

        expect(result.current.isFullscreen).toBe(false);
        await expect(result.current.enter()).rejects.toThrow(/never attached/);
    });

    it("rejects when the browser exposes no way to enter fullscreen", async () => {
        const stage = mountStage();
        const { result } = renderHook(() => useFullscreen(refTo(stage)));

        await expect(result.current.enter()).rejects.toThrow(/no way to enter/);
    });

    it("rejects when the browser exposes no way to leave fullscreen", async () => {
        const stage = mountStage();
        const { result } = renderHook(() => useFullscreen(refTo(stage)));
        setFullscreenElement(stage);

        await expect(result.current.exit()).rejects.toThrow(/no way to leave/);
    });

    it("exit() resolves without calling exitFullscreen when nothing is fullscreen", async () => {
        const exitFullscreen = vi.fn(releaseFullscreen);
        define(document, "exitFullscreen", exitFullscreen);
        const { result } = renderHook(() => useFullscreen());

        await expect(result.current.exit()).resolves.toBeUndefined();
        expect(exitFullscreen).not.toHaveBeenCalled();
    });

    it("toggle() enters when out and exits when in", async () => {
        const stage = mountStage();
        define(HTMLElement.prototype, "requestFullscreen", grantFullscreen);
        define(document, "exitFullscreen", releaseFullscreen);
        const { result } = renderHook(() => useFullscreen(refTo(stage)));

        await act(async () => {
            await result.current.toggle();
        });
        expect(result.current.isFullscreen).toBe(true);

        await act(async () => {
            await result.current.toggle();
        });
        expect(result.current.isFullscreen).toBe(false);
    });

    it("toggle() rejects when the referenced element is not mounted", async () => {
        define(HTMLElement.prototype, "requestFullscreen", grantFullscreen);
        const { result } = renderHook(() => useFullscreen(refTo(null)));

        await expect(result.current.toggle()).rejects.toThrow(/never attached/);
    });
});

describe("useFullscreen — outside a browser", () => {
    it("isFullscreenSupported() reports false with no document", () => {
        vi.stubGlobal("document", undefined);

        expect(isFullscreenSupported()).toBe(false);
    });

    it("getFullscreenElement() reports null with no document", () => {
        vi.stubGlobal("document", undefined);

        expect(getFullscreenElement()).toBe(null);
    });

    it("enter() rejects instead of throwing a ReferenceError with no document", async () => {
        const { result, unmount } = renderHook(() => useFullscreen());
        const { enter } = result.current;
        unmount();

        vi.stubGlobal("document", undefined);

        await expect(enter()).rejects.toThrow(/no document/);
    });
});

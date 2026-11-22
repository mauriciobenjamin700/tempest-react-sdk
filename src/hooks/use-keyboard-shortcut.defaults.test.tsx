import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useKeyboardShortcut } from "./use-keyboard-shortcut";
import type { KeyboardShortcut, UseKeyboardShortcutOptions } from "./use-keyboard-shortcut";

afterEach(() => {
    document.body.replaceChildren();
});

/**
 * Mount the hook and return the handler spy.
 *
 * @param shortcut - Shortcut to bind.
 * @param options - Hook options.
 * @returns The handler spy.
 */
function mount(
    shortcut: KeyboardShortcut,
    options?: UseKeyboardShortcutOptions,
): ReturnType<typeof vi.fn> {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut(shortcut, handler, options));
    return handler;
}

/**
 * Dispatch a cancelable, bubbling `keydown` from a target, as a real key press does.
 *
 * @param target - Where the key is pressed.
 * @param init - Key and modifiers.
 * @returns The dispatched event, to read `defaultPrevented`.
 */
function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
}

/**
 * Append a text input to the document.
 *
 * @returns The input.
 */
function field(): HTMLInputElement {
    const input = document.createElement("input");
    document.body.appendChild(input);
    return input;
}

describe("useKeyboardShortcut — a Ctrl/Cmd shortcut works like an app shortcut (#729)", () => {
    it("fires mod+k with the focus in a text field", () => {
        const handler = mount({ key: "k", mod: true });
        press(field(), { key: "k", metaKey: true });
        press(field(), { key: "k", ctrlKey: true });
        expect(handler).toHaveBeenCalledTimes(2);
    });

    it("cancels the browser's own action for a matched Ctrl/Cmd shortcut", () => {
        mount({ key: "k", mod: true });
        expect(press(window, { key: "k", ctrlKey: true }).defaultPrevented).toBe(true);
    });

    it("cancels the browser's action for an Alt shortcut, which still ignores fields", () => {
        const handler = mount({ key: "n", alt: true });
        expect(press(window, { key: "n", altKey: true }).defaultPrevented).toBe(true);
        press(field(), { key: "n", altKey: true });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("leaves a key that did not match alone", () => {
        mount({ key: "k", mod: true });
        expect(press(window, { key: "j", ctrlKey: true }).defaultPrevented).toBe(false);
        expect(press(window, { key: "k" }).defaultPrevented).toBe(false);
    });

    it("lets the handler see the event already cancelled", () => {
        const seen: boolean[] = [];
        renderHook(() =>
            useKeyboardShortcut({ key: "k", mod: true }, (event) =>
                seen.push(event.defaultPrevented),
            ),
        );
        press(window, { key: "k", metaKey: true });
        expect(seen).toEqual([true]);
    });
});

describe("useKeyboardShortcut — a plain key still belongs to the field it is typed in", () => {
    it("does not fire a plain-key shortcut inside a field", () => {
        const handler = mount({ key: "/" });
        press(field(), { key: "/" });
        expect(handler).not.toHaveBeenCalled();
    });

    it("does not cancel a plain-key shortcut it handles", () => {
        const handler = mount({ key: "/" });
        expect(press(window, { key: "/" }).defaultPrevented).toBe(false);
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("does not cancel a Shift-only shortcut", () => {
        mount({ key: "?", shift: true });
        expect(press(window, { key: "?", shiftKey: true }).defaultPrevented).toBe(false);
    });
});

describe("useKeyboardShortcut — the defaults are overridable", () => {
    it("keeps the field's own editing for mod+z when ignoreInput is true", () => {
        const handler = mount({ key: "z", mod: true }, { ignoreInput: true });
        const event = press(field(), { key: "z", ctrlKey: true });
        expect(handler).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it("leaves the browser's action in place when preventDefault is false", () => {
        const handler = mount({ key: "k", mod: true }, { preventDefault: false });
        expect(press(window, { key: "k", ctrlKey: true }).defaultPrevented).toBe(false);
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("cancels a plain-key shortcut when preventDefault is true", () => {
        mount({ key: "/" }, { preventDefault: true });
        expect(press(window, { key: "/" }).defaultPrevented).toBe(true);
    });
});

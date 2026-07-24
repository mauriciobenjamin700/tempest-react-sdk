import { fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKeyboardShortcut } from "./use-keyboard-shortcut";

function fireKey(init: KeyboardEventInit): void {
    window.dispatchEvent(new KeyboardEvent("keydown", init));
}

describe("useKeyboardShortcut", () => {
    it("fires on exact key match", () => {
        const handler = vi.fn();
        renderHook(() => useKeyboardShortcut({ key: "k" }, handler));
        fireKey({ key: "k" });
        expect(handler).toHaveBeenCalledOnce();
    });

    it("respects mod (Ctrl)", () => {
        const handler = vi.fn();
        renderHook(() => useKeyboardShortcut({ key: "k", mod: true }, handler));
        fireKey({ key: "k", ctrlKey: true });
        expect(handler).toHaveBeenCalled();
    });

    it("does not fire when disabled", () => {
        const handler = vi.fn();
        renderHook(() => useKeyboardShortcut({ key: "k" }, handler, { disabled: true }));
        fireKey({ key: "k" });
        expect(handler).not.toHaveBeenCalled();
    });

    it("ignores keys inside input elements", () => {
        const handler = vi.fn();
        renderHook(() => useKeyboardShortcut({ key: "k" }, handler));
        const input = document.createElement("input");
        document.body.appendChild(input);
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
        document.body.removeChild(input);
        expect(handler).not.toHaveBeenCalled();
    });
});

describe("useKeyboardShortcut — modifier matching and input scoping", () => {
    /** Mount the hook with a shortcut and return the handler spy. */
    function mount(
        shortcut: Parameters<typeof useKeyboardShortcut>[0],
        options?: Parameters<typeof useKeyboardShortcut>[2],
    ) {
        const handler = vi.fn();
        renderHook(() => useKeyboardShortcut(shortcut, handler, options));
        return handler;
    }

    it("matches the key case-insensitively", () => {
        const handler = mount({ key: "k" });
        fireEvent.keyDown(window, { key: "K" });
        expect(handler).toHaveBeenCalled();
    });

    it("requires ctrl when ctrl is requested", () => {
        const handler = mount({ key: "s", ctrl: true });
        fireEvent.keyDown(window, { key: "s" });
        expect(handler).not.toHaveBeenCalled();
        fireEvent.keyDown(window, { key: "s", ctrlKey: true });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("requires meta when meta is requested", () => {
        const handler = mount({ key: "s", meta: true });
        fireEvent.keyDown(window, { key: "s", ctrlKey: true });
        expect(handler).not.toHaveBeenCalled();
        fireEvent.keyDown(window, { key: "s", metaKey: true });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("accepts either ctrl or meta for mod", () => {
        const handler = mount({ key: "k", mod: true });
        fireEvent.keyDown(window, { key: "k", metaKey: true });
        fireEvent.keyDown(window, { key: "k", ctrlKey: true });
        expect(handler).toHaveBeenCalledTimes(2);

        fireEvent.keyDown(window, { key: "k" });
        expect(handler).toHaveBeenCalledTimes(2);
    });

    it("enforces shift and alt exactly", () => {
        const shift = mount({ key: "p", shift: true });
        fireEvent.keyDown(window, { key: "p" });
        expect(shift).not.toHaveBeenCalled();
        fireEvent.keyDown(window, { key: "p", shiftKey: true });
        expect(shift).toHaveBeenCalledTimes(1);

        const plain = mount({ key: "q" });
        fireEvent.keyDown(window, { key: "q", altKey: true });
        expect(plain).not.toHaveBeenCalled();
        fireEvent.keyDown(window, { key: "q" });
        expect(plain).toHaveBeenCalledTimes(1);
    });

    it("ignores a different key entirely", () => {
        const handler = mount({ key: "k" });
        fireEvent.keyDown(window, { key: "j" });
        expect(handler).not.toHaveBeenCalled();
    });

    it("fires inside a text field when ignoreInput is off", () => {
        const handler = mount({ key: "k" }, { ignoreInput: false });
        const input = document.createElement("input");
        document.body.appendChild(input);
        fireEvent.keyDown(input, { key: "k" });
        expect(handler).toHaveBeenCalled();
        input.remove();
    });

    it("skips textarea, select and contenteditable targets by default", () => {
        const handler = mount({ key: "k" });
        const textarea = document.createElement("textarea");
        const select = document.createElement("select");
        const editable = document.createElement("div");
        editable.contentEditable = "true";
        Object.defineProperty(editable, "isContentEditable", { value: true });
        document.body.append(textarea, select, editable);

        fireEvent.keyDown(textarea, { key: "k" });
        fireEvent.keyDown(select, { key: "k" });
        fireEvent.keyDown(editable, { key: "k" });
        expect(handler).not.toHaveBeenCalled();

        textarea.remove();
        select.remove();
        editable.remove();
    });

    it("fires when the event target is not an element", () => {
        const handler = mount({ key: "k" });
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
        expect(handler).toHaveBeenCalled();
    });

    it("detaches the listener on unmount", () => {
        const handler = vi.fn();
        const { unmount } = renderHook(() => useKeyboardShortcut({ key: "k" }, handler));
        unmount();
        fireEvent.keyDown(window, { key: "k" });
        expect(handler).not.toHaveBeenCalled();
    });
});

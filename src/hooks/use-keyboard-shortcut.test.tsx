import { renderHook } from "@testing-library/react";
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

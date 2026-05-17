import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKeyboardShortcut } from "./use-keyboard-shortcut";

function fire(init: KeyboardEventInit): void {
    window.dispatchEvent(new KeyboardEvent("keydown", init));
}

describe("useKeyboardShortcut modifiers", () => {
    it("matches Cmd via mod=true on macOS-like setup", () => {
        const handler = vi.fn();
        renderHook(() => useKeyboardShortcut({ key: "p", mod: true }, handler));
        fire({ key: "p", metaKey: true });
        expect(handler).toHaveBeenCalled();
    });

    it("requires shift when shift=true", () => {
        const handler = vi.fn();
        renderHook(() => useKeyboardShortcut({ key: "a", shift: true }, handler));
        fire({ key: "a" });
        expect(handler).not.toHaveBeenCalled();
        fire({ key: "a", shiftKey: true });
        expect(handler).toHaveBeenCalled();
    });

    it("requires alt when alt=true", () => {
        const handler = vi.fn();
        renderHook(() => useKeyboardShortcut({ key: "a", alt: true }, handler));
        fire({ key: "a", altKey: true });
        expect(handler).toHaveBeenCalled();
    });

    it("does not match when ctrl is required but absent", () => {
        const handler = vi.fn();
        renderHook(() => useKeyboardShortcut({ key: "a", ctrl: true }, handler));
        fire({ key: "a" });
        expect(handler).not.toHaveBeenCalled();
    });
});

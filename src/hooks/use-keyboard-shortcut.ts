import { useEffect } from "react";

export interface KeyboardShortcut {
    /** Key name (`"k"`, `"Enter"`, `"Escape"`, `"ArrowDown"`, etc.). Case-insensitive. */
    key: string;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    alt?: boolean;
    /** Match either Ctrl or Cmd. Useful for cross-OS shortcuts. */
    mod?: boolean;
}

export interface UseKeyboardShortcutOptions {
    /** Disable the shortcut without unmounting. Default: false. */
    disabled?: boolean;
    /** Listen to the entire window. Pass `false` to scope to a specific element via the handler. Default: true. */
    global?: boolean;
    /** Suppress the event from firing inside `<input>`/`<textarea>`/`[contenteditable]`. Default: true. */
    ignoreInput?: boolean;
}

function matches(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
    if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;
    const ctrl = !!shortcut.ctrl;
    const meta = !!shortcut.meta;
    const shift = !!shortcut.shift;
    const alt = !!shortcut.alt;
    if (shortcut.mod) {
        if (!event.ctrlKey && !event.metaKey) return false;
    } else {
        if (event.ctrlKey !== ctrl) return false;
        if (event.metaKey !== meta) return false;
    }
    if (event.shiftKey !== shift) return false;
    if (event.altKey !== alt) return false;
    return true;
}

function isEditable(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    return target.isContentEditable;
}

/**
 * Bind a global keyboard shortcut. Supports modifier combinations and a
 * cross-OS `mod` key (Ctrl on Windows/Linux, Cmd on macOS).
 *
 * The effect depends on the individual `shortcut` fields rather than on the
 * object itself: callers pass an inline literal (`{ key: "k", mod: true }`),
 * which is a fresh reference on every render and would otherwise tear down and
 * re-add the listener each time. `exhaustive-deps` is silenced for that line
 * because the destructured fields are the complete dependency set.
 *
 * @example
 * useKeyboardShortcut({ key: "k", mod: true }, () => openSearch());
 */
export function useKeyboardShortcut(
    shortcut: KeyboardShortcut,
    handler: (event: KeyboardEvent) => void,
    options: UseKeyboardShortcutOptions = {},
): void {
    const { disabled = false, ignoreInput = true } = options;

    useEffect(() => {
        if (disabled || typeof window === "undefined") return;
        const listener = (event: KeyboardEvent): void => {
            if (ignoreInput && isEditable(event.target)) return;
            if (matches(event, shortcut)) handler(event);
        };
        window.addEventListener("keydown", listener);
        return () => window.removeEventListener("keydown", listener);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        disabled,
        ignoreInput,
        shortcut.key,
        shortcut.ctrl,
        shortcut.meta,
        shortcut.shift,
        shortcut.alt,
        shortcut.mod,
        handler,
    ]);
}

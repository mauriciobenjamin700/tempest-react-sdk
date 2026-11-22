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
    /**
     * Suppress the event from firing inside `<input>`/`<textarea>`/`<select>`/
     * `[contenteditable]`. Default: `true` for a shortcut without `ctrl`, `meta`
     * or `mod`, `false` for one with them.
     *
     * A plain key (`"/"`, `"?"`, `"Escape"`) typed in a field belongs to the
     * field. A Ctrl/Cmd combination does not type anything, and a ⌘K that only
     * worked outside the search box is the opposite of what a palette wants.
     * Binding an editing combination the field itself handles (`mod+z`, `mod+a`,
     * `mod+c`), pass `true` to keep the field's own behavior.
     */
    ignoreInput?: boolean;
    /**
     * Call `event.preventDefault()` on a match, before the handler. Default:
     * `true` for a shortcut with `ctrl`, `meta`, `mod` or `alt`, `false` otherwise.
     *
     * Ctrl+K focuses the browser's search box in Chrome and Firefox, Ctrl+P
     * prints, Ctrl+S saves the page: without this the app and the browser both
     * act on the key. A plain key stays untouched by default, so binding `"/"`
     * does not stop it from being typed elsewhere.
     */
    preventDefault?: boolean;
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

/**
 * Whether a shortcut carries a command modifier (Ctrl, Cmd or the cross-OS
 * `mod`), the modifiers that never type a character.
 *
 * @param shortcut - The shortcut to inspect.
 * @returns `true` when `ctrl`, `meta` or `mod` is set.
 */
function hasCommandModifier(shortcut: KeyboardShortcut): boolean {
    return !!(shortcut.ctrl || shortcut.meta || shortcut.mod);
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
 * A shortcut with Ctrl/Cmd fires with the focus in a field and cancels the
 * browser's own action for the key by default (#729); see
 * {@link UseKeyboardShortcutOptions.ignoreInput} and
 * {@link UseKeyboardShortcutOptions.preventDefault}. To show the shortcut to the
 * user with the right key for the platform, use `formatShortcut`.
 *
 * @example
 * useKeyboardShortcut({ key: "k", mod: true }, () => openSearch());
 */
export function useKeyboardShortcut(
    shortcut: KeyboardShortcut,
    handler: (event: KeyboardEvent) => void,
    options: UseKeyboardShortcutOptions = {},
): void {
    const command = hasCommandModifier(shortcut);
    const {
        disabled = false,
        ignoreInput = !command,
        preventDefault = command || !!shortcut.alt,
    } = options;

    useEffect(() => {
        if (disabled || typeof window === "undefined") return;
        const listener = (event: KeyboardEvent): void => {
            if (ignoreInput && isEditable(event.target)) return;
            if (!matches(event, shortcut)) return;
            if (preventDefault) event.preventDefault();
            handler(event);
        };
        window.addEventListener("keydown", listener);
        return () => window.removeEventListener("keydown", listener);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        disabled,
        ignoreInput,
        preventDefault,
        shortcut.key,
        shortcut.ctrl,
        shortcut.meta,
        shortcut.shift,
        shortcut.alt,
        shortcut.mod,
        handler,
    ]);
}

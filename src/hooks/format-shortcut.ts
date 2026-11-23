import type { KeyboardShortcut } from "./use-keyboard-shortcut";

/** Which keyboard convention a shortcut label follows. */
export type ShortcutPlatform = "apple" | "other";

/** Options for {@link formatShortcut}. */
export interface FormatShortcutOptions {
    /**
     * Convention to render. Default: {@link isApplePlatform} decides. Pass it to
     * render a fixed label (a test, a screenshot, a help page that shows both).
     */
    platform?: ShortcutPlatform;
}

/** `navigator.userAgentData`, typed to the one member read here. */
interface UserAgentDataLike {
    platform?: string;
}

/** Platform strings of macOS, iOS and iPadOS, as the three sources spell them. */
const APPLE_PLATFORM = /mac|iphone|ipad|ipod/i;

/**
 * Whether the current device follows Apple's keyboard convention (⌘ instead of
 * Ctrl).
 *
 * Reads `navigator.userAgentData.platform` (Chromium: `"macOS"`), then the
 * deprecated but universally present `navigator.platform` (`"MacIntel"`,
 * `"iPhone"`; iPadOS in desktop mode reports `"MacIntel"` too, which is the
 * right answer for its hardware keyboard), then the user agent. Outside a
 * browser — a test in Node, a build script — there is no navigator and the
 * answer is `false`.
 *
 * It is what `useKeyboardShortcut`'s `mod` already resolves at listen time; this
 * is the same question asked at render time, to *show* the key.
 *
 * @returns `true` on macOS, iOS and iPadOS.
 */
export function isApplePlatform(): boolean {
    if (typeof navigator === "undefined") return false;
    const data = (navigator as Navigator & { userAgentData?: UserAgentDataLike }).userAgentData;
    const source = data?.platform || navigator.platform || navigator.userAgent || "";
    return APPLE_PLATFORM.test(source);
}

/** Labels for named keys, per platform; anything else is shown as written. */
const KEY_LABELS: Record<string, { apple: string; other: string }> = {
    " ": { apple: "Space", other: "Space" },
    arrowup: { apple: "↑", other: "↑" },
    arrowdown: { apple: "↓", other: "↓" },
    arrowleft: { apple: "←", other: "←" },
    arrowright: { apple: "→", other: "→" },
    backspace: { apple: "⌫", other: "Backspace" },
    delete: { apple: "⌦", other: "Del" },
    enter: { apple: "↩", other: "Enter" },
    escape: { apple: "esc", other: "Esc" },
    tab: { apple: "⇥", other: "Tab" },
};

/**
 * The visible label of a shortcut's key.
 *
 * @param key - `KeyboardShortcut.key`.
 * @param platform - Convention to render.
 * @returns A single character upper-cased, a named key from the table, or the
 *   key as written with its first letter upper-cased.
 */
function keyLabel(key: string, platform: ShortcutPlatform): string {
    const named = KEY_LABELS[key.toLowerCase()];
    if (named) return named[platform];
    if (key.length === 1) return key.toUpperCase();
    return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Render a {@link KeyboardShortcut} the way the user's platform writes it:
 * `⌘K` / `⇧⌘P` on Apple devices, `Ctrl+K` / `Ctrl+Shift+P` elsewhere.
 *
 * Takes the same object `useKeyboardShortcut` listens for, so the label and the
 * binding cannot drift apart. `mod` becomes ⌘ or Ctrl. The Apple form follows
 * the system menus (modifiers in the order ⌃ ⌥ ⇧ ⌘, no separator); the other
 * follows Windows and Linux (Ctrl, Alt, Shift, Meta joined by `+`).
 *
 * @param shortcut - The shortcut to describe.
 * @param options - See {@link FormatShortcutOptions}.
 * @returns The label, ready for a `<Kbd>`.
 *
 * @example
 * <Kbd>{formatShortcut({ key: "k", mod: true })}</Kbd>
 */
export function formatShortcut(
    shortcut: KeyboardShortcut,
    options: FormatShortcutOptions = {},
): string {
    const platform: ShortcutPlatform = options.platform ?? (isApplePlatform() ? "apple" : "other");
    const ctrl = !!shortcut.ctrl || (!!shortcut.mod && platform === "other");
    const meta = !!shortcut.meta || (!!shortcut.mod && platform === "apple");
    const key = keyLabel(shortcut.key, platform);

    if (platform === "apple") {
        const symbols: string[] = [];
        if (ctrl) symbols.push("⌃");
        if (shortcut.alt) symbols.push("⌥");
        if (shortcut.shift) symbols.push("⇧");
        if (meta) symbols.push("⌘");
        return symbols.join("") + key;
    }

    const parts: string[] = [];
    if (ctrl) parts.push("Ctrl");
    if (shortcut.alt) parts.push("Alt");
    if (shortcut.shift) parts.push("Shift");
    if (meta) parts.push("Meta");
    parts.push(key);
    return parts.join("+");
}

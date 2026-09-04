import { useEffect, useRef } from "react";

/** A key offered for push-to-talk, with the label a settings screen shows. */
export interface PushToTalkKey {
    /** `KeyboardEvent.code`, which is layout-independent. */
    code: string;
    /** What to show a person. `code` itself is not a label. */
    label: string;
}

/**
 * The keys worth offering for push-to-talk.
 *
 * Identified by `code` rather than `key` so a binding survives a layout change:
 * on an ABNT2 keyboard the `key` reported for the backquote position is not what
 * a US layout reports, while `Backquote` is the same physical key everywhere.
 *
 * Left-hand modifiers only. The right-hand ones sit under the hand that is
 * usually on the mouse, and a modifier that is also a shortcut prefix
 * (`ControlLeft` with a browser shortcut) is a deliberate trade the caller makes
 * by choosing it.
 */
export const PUSH_TO_TALK_KEYS: readonly PushToTalkKey[] = [
    { code: "Space", label: "Espaço" },
    { code: "ControlLeft", label: "Ctrl esquerdo" },
    { code: "AltLeft", label: "Alt esquerdo" },
    { code: "ShiftLeft", label: "Shift esquerdo" },
    { code: "Backquote", label: "Crase (`)" },
];

/** The key a caller gets when it does not choose one. */
export const DEFAULT_PUSH_TO_TALK_KEY = "Space";

/**
 * The label to show for a `KeyboardEvent.code`.
 *
 * @param code - The bound key's code.
 * @returns Its label, or the code itself for a key this list does not name —
 *     showing `"F13"` beats showing nothing.
 */
export function pushToTalkKeyLabel(code: string): string {
    return PUSH_TO_TALK_KEYS.find((key) => key.code === code)?.label ?? code;
}

/**
 * Whether a keystroke is meant for something the person is typing into.
 *
 * Without this a push-to-talk key bound to Space opens the microphone every time
 * somebody writes a message — and the space never reaches the text field,
 * because the handler preventDefault'd it.
 *
 * @param target - The event's target.
 * @returns `true` when the keystroke belongs to a field, not to the app.
 */
function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Options for {@link usePushToTalk}. */
export interface UsePushToTalkOptions {
    /** `KeyboardEvent.code` to hold. Default {@link DEFAULT_PUSH_TO_TALK_KEY}. */
    code?: string;
    /** Called once when the key goes down. */
    onDown: () => void;
    /** Called when the key comes up, the window blurs, or the hook unmounts. */
    onUp: () => void;
    /**
     * Whether the binding is live. Default `true`.
     *
     * Turning it off releases first, so flipping a call from push-to-talk to an
     * open microphone while the key is held does not leave `onUp` unfired.
     */
    enabled?: boolean;
}

/**
 * Hold a key to transmit; release it to go silent again.
 *
 * Looks like `keydown`/`keyup` and is not, because three things go wrong:
 *
 * 1. **`blur` has to release.** Alt-tabbing away while holding the key means the
 *    browser never sees the `keyup`, and the microphone stays open for as long as
 *    the person is looking at another window — exactly what push-to-talk exists
 *    to prevent.
 * 2. **Auto-repeat has to be ignored.** A held key repeats at the keyboard's rate,
 *    and without the `repeat` check `onDown` fires on every one of them.
 * 3. **A text field has to win.** Space bound to push-to-talk with the focus in an
 *    `<input>` means the space never reaches the message being written.
 *
 * Unmounting releases too, for the same reason `blur` does: the callback that
 * stops transmitting has to run even when the component holding it goes away
 * mid-press.
 *
 * The callbacks are read through a ref that a commit-time effect refreshes, so
 * passing inline arrows neither tears the listeners down on every render nor
 * writes to the ref during one — a render React discards would leave the ref
 * pointing at callbacks that never became the UI.
 *
 * @param options - See {@link UsePushToTalkOptions}.
 *
 * @example
 * usePushToTalk({
 *     code: "Space",
 *     onDown: () => setMicEnabled(true),
 *     onUp: () => setMicEnabled(false),
 * });
 */
export function usePushToTalk({
    code = DEFAULT_PUSH_TO_TALK_KEY,
    onDown,
    onUp,
    enabled = true,
}: UsePushToTalkOptions): void {
    const callbacks = useRef({ onDown, onUp });
    useEffect(() => {
        callbacks.current = { onDown, onUp };
    });

    useEffect(() => {
        if (!enabled || typeof window === "undefined") return;
        let held = false;

        const release = (): void => {
            if (!held) return;
            held = false;
            callbacks.current.onUp();
        };

        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.code !== code || event.repeat) return;
            if (isTypingTarget(event.target)) return;
            event.preventDefault();
            if (held) return;
            held = true;
            callbacks.current.onDown();
        };

        /**
         * Release on the way up, and never mind where the keystroke landed.
         *
         * The field guard belongs on the way **down** — it is what stops a
         * push-to-talk bound to Space from opening the microphone every time
         * somebody writes a message. On the way up it did the opposite of its
         * job: `keyup` is delivered to whatever is focused when the key rises,
         * not to what was focused when it fell, so clicking into an input while
         * still holding sent the release into the guard and left `held` true.
         * The microphone stayed open until the window blurred.
         *
         * `held` is the guard this needs. If we never opened the microphone
         * there is nothing to close, and `release()` already returns on that —
         * so the only thing left to decide is `preventDefault`, which is
         * honest only for a keystroke we actually acted on.
         */
        const handleKeyUp = (event: KeyboardEvent): void => {
            if (event.code !== code || !held) return;
            event.preventDefault();
            release();
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", release);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", release);
            release();
        };
    }, [code, enabled]);
}

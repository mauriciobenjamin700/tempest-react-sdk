import {
    forwardRef,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent,
    type ReactNode,
    type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/utils/cn";

import { chatStrings } from "./chat-groups";
import styles from "./Chat.module.css";

/** DOM attributes the composer redefines. */
type OverriddenDomProps = "onSubmit" | "value" | "defaultValue" | "rows";

export interface ChatComposerProps extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    OverriddenDomProps
> {
    /** Called with the trimmed text. The field clears only when this does not throw. */
    onSend: (text: string) => void | Promise<void>;
    /** Locale for the placeholder and the send label. Default `"pt-BR"`. */
    locale?: "pt-BR" | "en";
    /** Rendered to the left of the send button — an attach button, an emoji picker. */
    actions?: ReactNode;
    /** Largest height the field grows to, in lines. Default 6. */
    maxRows?: number;
    /** Send label. Defaults to the locale string. */
    sendLabel?: string;
    /**
     * Called when `onSend` rejects. The draft is kept either way.
     *
     * Without it the rejection is swallowed after the draft is preserved, because
     * the alternative is worse: re-throwing out of a DOM event handler surfaces as
     * an unhandled promise rejection — console noise for the developer, a hit in
     * whatever crash reporter the app runs, and nothing the user can act on. The
     * visible signal is the text still sitting in the field; wire this to a toast
     * to say why.
     */
    onError?: (error: unknown) => void;
}

/** Imperative handle, so a thread can focus the field after retrying a message. */
export interface ChatComposerHandle {
    focus: () => void;
    /** Replace the draft — used to put a failed message back in the field. */
    setValue: (text: string) => void;
}

/**
 * The message field of a thread: a textarea that grows with its content, sends on
 * `Enter` and keeps `Shift+Enter` for a newline.
 *
 * Uncontrolled on purpose. A chat draft changes on every keystroke, and lifting
 * that into app state re-renders the whole thread per character — the one place
 * where "controlled by default" costs something visible. Apps that need the draft
 * (a persisted composer, a slash-command menu) read it from `onChange` or drive it
 * through the ref.
 *
 * @example
 * <ChatComposer onSend={(text) => api.post("/messages", { body: { text } })} />
 */
export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
    {
        onSend,
        locale = "pt-BR",
        actions,
        maxRows = 6,
        sendLabel,
        onError,
        className,
        disabled,
        placeholder,
        onKeyDown,
        onChange,
        ...rest
    },
    ref,
) {
    const strings = chatStrings(locale);
    const textarea = useRef<HTMLTextAreaElement | null>(null);
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState(false);

    useImperativeHandle(ref, () => ({
        focus: () => textarea.current?.focus(),
        setValue: (text: string) => {
            setValue(text);
            textarea.current?.focus();
        },
    }));

    /**
     * Grow the field to fit its content, up to `maxRows`.
     *
     * Measured from `scrollHeight` after resetting the height, because
     * `scrollHeight` on an element that is already tall enough reports the
     * current height and the field would never shrink back.
     */
    useLayoutEffect(() => {
        const node = textarea.current;
        if (!node) return;
        node.style.height = "auto";
        const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight) || 20;
        const max = lineHeight * maxRows;
        node.style.height = `${Math.min(node.scrollHeight, max)}px`;
        node.style.overflowY = node.scrollHeight > max ? "auto" : "hidden";
    }, [value, maxRows]);

    const submit = async (): Promise<void> => {
        const text = value.trim();
        if (!text || busy || disabled) return;
        setBusy(true);
        try {
            await onSend(text);
            setValue("");
        } catch (error) {
            onError?.(error);
        } finally {
            setBusy(false);
        }
    };

    const handleSubmit = (event: FormEvent): void => {
        event.preventDefault();
        void submit();
    };

    /**
     * `Enter` sends, `Shift+Enter` breaks the line.
     *
     * The IME check is not optional: while composing Japanese or Korean, `Enter`
     * confirms the candidate word and `keyCode === 229` marks that keystroke.
     * Sending there would post half a word and eat the confirmation.
     */
    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key !== "Enter" || event.shiftKey) return;
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        void submit();
    };

    return (
        <form className={cn(styles.composer, className)} onSubmit={handleSubmit}>
            <textarea
                {...rest}
                ref={textarea}
                className={styles.field}
                rows={1}
                value={value}
                disabled={disabled}
                placeholder={placeholder ?? strings.placeholder}
                onChange={(event) => {
                    setValue(event.target.value);
                    onChange?.(event);
                }}
                onKeyDown={handleKeyDown}
            />
            <div className={styles.composerActions}>
                {actions}
                <button
                    type="submit"
                    className={styles.send}
                    disabled={disabled || busy || value.trim() === ""}
                >
                    {sendLabel ?? strings.send}
                </button>
            </div>
        </form>
    );
});

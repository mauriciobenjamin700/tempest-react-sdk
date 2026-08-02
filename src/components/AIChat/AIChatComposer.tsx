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

import { aiChatStrings } from "./ai-chat-turns";
import styles from "./AIChat.module.css";

/** DOM attributes the composer redefines. */
type OverriddenDomProps = "onSubmit" | "value" | "defaultValue" | "rows";

export interface AIChatComposerProps extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    OverriddenDomProps
> {
    /** Called with the trimmed prompt. The field clears only when this does not throw. */
    onSend: (text: string) => void | Promise<void>;
    /**
     * Abort the turn in flight.
     *
     * When given together with `generating`, the send button becomes a stop button
     * and `Escape` aborts too.
     */
    onStop?: () => void;
    /** A turn is being generated. Replaces send with stop and refuses to send. */
    generating?: boolean;
    /** Locale for the placeholder and the button labels. Default `"pt-BR"`. */
    locale?: "pt-BR" | "en";
    /** Left of the send button — an attach control, a model picker, a tool toggle. */
    actions?: ReactNode;
    /** Under the field — a token count, the model name, a disclaimer. */
    footer?: ReactNode;
    /** Largest height the field grows to, in lines. Default 8. */
    maxRows?: number;
    /**
     * Called when `onSend` rejects. The draft is kept either way.
     *
     * Without it the rejection is swallowed after the draft is preserved: re-throwing
     * out of a DOM event handler surfaces as an unhandled promise rejection, which is
     * console noise for the developer and nothing the user can act on. The visible
     * signal is the prompt still sitting in the field; wire this to a toast to say why.
     */
    onError?: (error: unknown) => void;
}

/** Imperative handle, so a thread can focus or refill the field. */
export interface AIChatComposerHandle {
    focus: () => void;
    /** Replace the draft — used to put a prompt back in the field. */
    setValue: (text: string) => void;
}

/**
 * The prompt field of a conversation with a model: a textarea that grows with its
 * content, sends on `Enter`, keeps `Shift+Enter` for a newline, and turns into a
 * stop button while a turn is streaming.
 *
 * Uncontrolled on purpose. A draft changes on every keystroke, and lifting that into
 * app state re-renders the whole transcript per character — with a streaming answer
 * above, that is the one place where "controlled by default" costs something
 * visible. Apps that need the draft (a persisted composer, a slash-command menu)
 * read it from `onChange` or drive it through the ref.
 *
 * @example
 * <AIChatComposer
 *     generating={generating}
 *     onSend={(text) => ask(text)}
 *     onStop={() => controller.abort()}
 *     footer={<small>Claude Opus 5 · pode errar</small>}
 * />
 */
export const AIChatComposer = forwardRef<AIChatComposerHandle, AIChatComposerProps>(
    function AIChatComposer(
        {
            onSend,
            onStop,
            generating = false,
            locale = "pt-BR",
            actions,
            footer,
            maxRows = 8,
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
        const strings = aiChatStrings(locale);
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
         * `scrollHeight` on an element that is already tall enough reports the current
         * height and the field would never shrink back.
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
            if (!text || busy || disabled || generating) return;
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
         * `Enter` sends, `Shift+Enter` breaks the line, `Escape` aborts a turn in
         * flight.
         *
         * The IME check is not optional: while composing Japanese or Korean, `Enter`
         * confirms the candidate word and `keyCode === 229` marks that keystroke.
         * Sending there would post half a word and eat the confirmation.
         */
        const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
            onKeyDown?.(event);
            if (event.defaultPrevented) return;
            if (event.key === "Escape" && generating && onStop) {
                event.preventDefault();
                onStop();
                return;
            }
            if (event.key !== "Enter" || event.shiftKey) return;
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            event.preventDefault();
            void submit();
        };

        const showStop = generating && onStop !== undefined;

        return (
            <form className={cn(styles.composer, className)} onSubmit={handleSubmit}>
                <div className={styles.composerBox}>
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
                        {showStop ? (
                            <button type="button" className={styles.stop} onClick={onStop}>
                                <span aria-hidden="true" className={styles.stopGlyph} />
                                {strings.stop}
                            </button>
                        ) : (
                            <button
                                type="submit"
                                className={styles.send}
                                disabled={disabled || busy || generating || value.trim() === ""}
                            >
                                {strings.send}
                            </button>
                        )}
                    </div>
                </div>
                {footer && <div className={styles.composerFooter}>{footer}</div>}
            </form>
        );
    },
);

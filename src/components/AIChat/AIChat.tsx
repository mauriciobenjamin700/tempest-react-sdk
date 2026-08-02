import { ArrowDown } from "lucide-react";
import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type HTMLAttributes,
    type ReactNode,
    type Ref,
} from "react";

import { useAnnounce } from "@/hooks/use-announce";
import { cn } from "@/utils/cn";

import { EmptyState } from "../EmptyState";
import {
    aiChatStrings,
    isGenerating,
    lastAssistantId,
    tailSignature,
    visibleTurns,
    type AIChatMessage,
    type AIChatVote,
} from "./ai-chat-turns";
import { AIChatComposer, type AIChatComposerHandle } from "./AIChatComposer";
import { AIChatTurn } from "./AIChatTurn";
import styles from "./AIChat.module.css";

/** DOM attributes this component redefines. */
type OverriddenDomProps = "children" | "onSubmit";

export interface AIChatProps extends Omit<HTMLAttributes<HTMLDivElement>, OverriddenDomProps> {
    /** The transcript, **oldest first**. Never reordered by the component. */
    messages: readonly AIChatMessage[];
    /** Renders the composer when given. Receives the trimmed prompt. */
    onSend?: (text: string) => void | Promise<void>;
    /** Abort the turn in flight. Shows the stop button while generating. */
    onStop?: () => void;
    /** Ask again for the newest assistant turn. */
    onRegenerate?: (message: AIChatMessage) => void;
    /** Re-submit an edited user turn. The app decides what to drop after it. */
    onEditSubmit?: (message: AIChatMessage, text: string) => void | Promise<void>;
    /** Rating on an assistant turn. */
    onFeedback?: (message: AIChatMessage, vote: AIChatVote) => void;
    /** Retry a turn that carries an `error`. */
    onRetry?: (message: AIChatMessage) => void;
    /**
     * The request is out and nothing has arrived yet.
     *
     * Distinct from a turn with `streaming: true`: apps that only push a message
     * once the first token lands need somewhere to say "we asked", and without it the
     * screen is frozen for however long the model takes to start.
     */
    pending?: boolean;
    /** Prompts offered on an empty transcript. Clicking one sends it. */
    suggestions?: readonly string[];
    /** Avatar for a turn — an `<Avatar>`, an `<Icon>`, a logo. */
    renderAvatar?: (message: AIChatMessage) => ReactNode;
    /** Render a body yourself — a tool-call card, a chart, a citation list. */
    renderContent?: (message: AIChatMessage) => ReactNode;
    /** Ratings to show as pressed, by message id. Omit to keep them local. */
    votes?: Readonly<Record<string, AIChatVote>>;
    /** Rendered above the transcript, inside the panel. */
    header?: ReactNode;
    /** Shown when there are no turns and no suggestions. */
    emptyState?: ReactNode;
    /** Show `"system"` turns. Default `false`. */
    showSystem?: boolean;
    /** Reasoning blocks start expanded. Default `false`. */
    defaultReasoningOpen?: boolean;
    /** Show line numbers in fenced code. Default `false`. */
    showLineNumbers?: boolean;
    /** Locale for labels. Default `"pt-BR"`. */
    locale?: "pt-BR" | "en";
    /** Placeholder for the composer. */
    placeholder?: string;
    /** Extra controls inside the composer, before the send button. */
    composerActions?: ReactNode;
    /**
     * Reach the composer imperatively — `focus()`, `getValue()`, `setValue()`.
     *
     * What makes dictation (or a slash-command menu, or "edit and resend") possible
     * without this component knowing anything about them: pair it with
     * `composerActions` and the button you put in the composer can write into the
     * field. Speech recognition is **not** wired in here on purpose — it would make
     * every consumer of `AIChat` pay for an API that streams audio to a third party.
     */
    composerRef?: Ref<AIChatComposerHandle>;
    /** Under the composer field — token count, model name, a disclaimer. */
    composerFooter?: ReactNode;
    /** Disable the composer — no credits, conversation archived, offline. */
    composerDisabled?: boolean;
    /** Largest height the composer grows to, in lines. Default 8. */
    maxRows?: number;
    /**
     * Called when `onSend` **or** `onEditSubmit` rejects. The draft stays in the field
     * either way.
     */
    onSendError?: (error: unknown) => void;
}

/** How close to the bottom still counts as "reading the newest turn", in pixels. */
const BOTTOM_SLACK = 48;

/**
 * A conversation with a model: role-based turns, Markdown answers, a reasoning
 * block, a streaming caret, per-turn actions and a composer that turns into a stop
 * button while a turn is generating.
 *
 * This is the shape ChatGPT, Claude and DeepSeek converged on, and it is a different
 * component from {@link Chat}, not a variant of it. A human thread is addressed by
 * author and cares about delivery state; a model transcript is addressed by role,
 * has no delivery state at all, and needs three things a human thread never does —
 * partial output, reasoning separate from the answer, and re-asking.
 *
 * Presentational and controlled, like the rest of the SDK: it takes a list and emits
 * intent (`onSend`, `onStop`, `onRegenerate`, `onEditSubmit`, `onFeedback`). The
 * transport stays with the app, because "how do I stream from my backend" has a
 * different answer per provider — the SDK's `createEventStream` covers SSE, `fetch`
 * with a `ReadableStream` covers the rest, and either way the app owns the
 * `AbortController` it hands to `onStop`.
 *
 * @example
 * <AIChat
 *     messages={turns}
 *     pending={pending}
 *     onSend={(text) => ask(text)}
 *     onStop={() => controller.current?.abort()}
 *     onRegenerate={(turn) => reask(turn)}
 *     onFeedback={(turn, vote) => track("answer_rated", { id: turn.id, vote })}
 *     suggestions={["Resuma o último relatório", "Quais pedidos atrasaram?"]}
 * />
 */
export function AIChat({
    messages,
    onSend,
    onStop,
    onRegenerate,
    onEditSubmit,
    onFeedback,
    onRetry,
    pending = false,
    suggestions = [],
    renderAvatar,
    renderContent,
    votes,
    header,
    emptyState,
    showSystem = false,
    defaultReasoningOpen = false,
    showLineNumbers = false,
    locale = "pt-BR",
    placeholder,
    composerActions,
    composerRef,
    composerFooter,
    composerDisabled,
    maxRows,
    onSendError,
    className,
    ...rest
}: AIChatProps) {
    const strings = aiChatStrings(locale);
    const turns = visibleTurns({ messages, showSystem });
    const generating = pending || isGenerating(messages);
    const newestAssistant = lastAssistantId(messages);
    const signature = tailSignature(messages);

    const composer = useRef<AIChatComposerHandle | null>(null);
    const thread = useRef<HTMLDivElement | null>(null);
    const stuckToBottom = useRef(true);
    const wasGenerating = useRef(false);
    const [atBottom, setAtBottom] = useState(true);
    const announce = useAnnounce();

    /**
     * Remember whether the reader is at the bottom, before the next tokens land.
     *
     * A transcript that always scrolls to the newest text yanks somebody out of the
     * answer they were re-reading — and with a streaming answer that would happen
     * dozens of times per second. So the jump only happens when they were already at
     * the bottom. The slack covers a partially visible last line.
     */
    const trackPosition = (): void => {
        const node = thread.current;
        if (!node) return;
        const next = node.scrollHeight - node.scrollTop - node.clientHeight < BOTTOM_SLACK;
        stuckToBottom.current = next;
        setAtBottom(next);
    };

    const jumpToLatest = (): void => {
        const node = thread.current;
        if (!node) return;
        stuckToBottom.current = true;
        setAtBottom(true);
        node.scrollTop = node.scrollHeight;
    };

    useLayoutEffect(() => {
        const node = thread.current;
        if (!node || !stuckToBottom.current) return;
        node.scrollTop = node.scrollHeight;
    }, [signature, pending]);

    useEffect(() => {
        const node = thread.current;
        if (!node) return;
        node.scrollTop = node.scrollHeight;
        // Mount lands on the newest turn; from then on `trackPosition` decides.
    }, []);

    /**
     * Announce the start and the end of a generation, and nothing in between.
     *
     * The transcript is a `role="log"` **without** `aria-live`: a live region over
     * streaming text makes a screen reader read the answer again on every token,
     * which is unusable. The two moments that matter are announced here instead —
     * through the shared `useAnnounce` region rather than a private one, so a page
     * holding a chat plus a table plus toasts still has exactly one live region per
     * politeness — and the finished answer is read from the log at the reader's own
     * pace.
     */
    useEffect(() => {
        if (generating) {
            announce(strings.generating);
            wasGenerating.current = true;
            return;
        }
        if (wasGenerating.current) {
            announce(strings.done);
            wasGenerating.current = false;
        }
    }, [generating, strings.generating, strings.done, announce]);

    const showSuggestions = turns.length === 0 && suggestions.length > 0 && onSend !== undefined;
    const detached = !atBottom && turns.length > 0;

    return (
        <div className={cn(styles.panel, className)} {...rest}>
            {header && <header className={styles.header}>{header}</header>}

            <div className={styles.threadWrapper}>
                <div
                    ref={thread}
                    className={styles.thread}
                    onScroll={trackPosition}
                    role="log"
                    tabIndex={0}
                    aria-label={strings.thread}
                >
                    {turns.length === 0 && !showSuggestions
                        ? (emptyState ?? (
                              <EmptyState title={strings.empty} description={strings.emptyHint} />
                          ))
                        : turns.map((message) => (
                              <AIChatTurn
                                  key={message.id}
                                  message={message}
                                  locale={locale}
                                  canRegenerate={
                                      message.id === newestAssistant && message.streaming !== true
                                  }
                                  onRegenerate={onRegenerate}
                                  onFeedback={onFeedback}
                                  onEditSubmit={onEditSubmit}
                                  onEditError={onSendError}
                                  onRetry={onRetry}
                                  renderAvatar={renderAvatar}
                                  renderContent={renderContent}
                                  vote={votes?.[message.id]}
                                  defaultReasoningOpen={defaultReasoningOpen}
                                  showLineNumbers={showLineNumbers}
                              />
                          ))}

                    {showSuggestions && (
                        <div className={styles.suggestions}>
                            <p className={styles.suggestionsTitle}>{strings.emptyHint}</p>
                            {suggestions.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    className={styles.suggestion}
                                    onClick={() => void onSend?.(suggestion)}
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    )}

                    {pending && !isGenerating(messages) && (
                        <p className={styles.thinking}>
                            <span className={styles.dots} aria-hidden="true">
                                <span />
                                <span />
                                <span />
                            </span>
                            {strings.thinking}
                        </p>
                    )}
                </div>

                {detached && (
                    <button
                        type="button"
                        className={styles.jump}
                        onClick={jumpToLatest}
                        aria-label={strings.jumpToLatest}
                        title={strings.jumpToLatest}
                    >
                        <ArrowDown size={16} aria-hidden />
                    </button>
                )}
            </div>

            {onSend && (
                <AIChatComposer
                    ref={composerRef ?? composer}
                    onSend={onSend}
                    onStop={onStop}
                    generating={generating}
                    locale={locale}
                    placeholder={placeholder}
                    actions={composerActions}
                    footer={composerFooter}
                    disabled={composerDisabled}
                    maxRows={maxRows}
                    onError={onSendError}
                />
            )}
        </div>
    );
}

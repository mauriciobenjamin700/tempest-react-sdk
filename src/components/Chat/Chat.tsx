/**
 * @tempest-limits file-lines, props-count, function-lines — message grouping needs
 * more context than a list does: currentUserId to decide sides, groupWindowMs and
 * now to decide where a bubble group breaks, typing for the indicator. The remaining
 * props are the composer's (placeholder, composerActions, composerDisabled, onSend,
 * onSendError) and the slots (renderAvatar, header, emptyState).
 */
import { useEffect, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/utils/cn";

import { EmptyState } from "../EmptyState";
import { VisuallyHidden } from "../VisuallyHidden";
import { ChatComposer, type ChatComposerHandle } from "./ChatComposer";
import {
    chatStrings,
    dayLabel,
    groupMessages,
    timeLabel,
    typingLabel,
    type ChatMessage,
} from "./chat-groups";
import styles from "./Chat.module.css";

/** DOM attributes this component redefines. */
type OverriddenDomProps = "children" | "onSubmit";

export interface ChatProps extends Omit<HTMLAttributes<HTMLDivElement>, OverriddenDomProps> {
    /** The thread, **oldest first**. Never reordered by the component. */
    messages: readonly ChatMessage[];
    /** Author id treated as "own" — decides side, colour and status ticks. */
    currentUserId?: string;
    /** Renders the composer when given. Receives the trimmed text. */
    onSend?: (text: string) => void | Promise<void>;
    /** Enables the retry control on a `"failed"` message. */
    onRetry?: (message: ChatMessage) => void;
    /** Names currently typing. One, two or a count is phrased for you. */
    typing?: readonly string[];
    /** Avatar for the first message of a run — an `<Avatar>`, an `<Icon>`. */
    renderAvatar?: (message: ChatMessage) => ReactNode;
    /** Rendered above the thread, inside the panel. */
    header?: ReactNode;
    /** Shown when there are no messages. */
    emptyState?: ReactNode;
    /** Gap that still keeps consecutive messages in one run. Default 5 min. */
    groupWindowMs?: number;
    /** Locale for labels. Default `"pt-BR"`. */
    locale?: "pt-BR" | "en";
    /** Reference instant for "Hoje"/"Ontem". Default: now, at render time. */
    now?: number;
    /** Placeholder for the composer. */
    placeholder?: string;
    /** Extra controls inside the composer, before the send button. */
    composerActions?: ReactNode;
    /** Disable the composer — no permission, thread archived, offline. */
    composerDisabled?: boolean;
    /** Called when `onSend` rejects. The draft stays in the field either way. */
    onSendError?: (error: unknown) => void;
}

/** Status glyph and label for an outgoing message. */
const STATUS_GLYPH: Record<NonNullable<ChatMessage["status"]>, string> = {
    sending: "◌",
    sent: "✓",
    read: "✓✓",
    failed: "!",
};

/**
 * A message thread: grouped by author and by day, own messages on one side, with
 * delivery state, a typing indicator and an optional composer.
 *
 * Presentational and controlled, like the rest of the SDK: it takes a list and
 * emits intent (`onSend`, `onRetry`). Where messages come from — REST, the SDK's
 * `createWebSocket`, an SSE stream — and how an optimistic insert is done stay with
 * the app, because those differ per backend and a component that assumed one would
 * be wrong for most.
 *
 * It works as a comment thread too: that is the same component with
 * `currentUserId` set and no `typing`.
 *
 * @example
 * <Chat
 *     messages={messages}
 *     currentUserId={me.id}
 *     typing={typingNames}
 *     onSend={(text) => send({ text })}
 *     onRetry={(message) => resend(message.id)}
 * />
 */
export function Chat({
    messages,
    currentUserId,
    onSend,
    onRetry,
    typing = [],
    renderAvatar,
    header,
    emptyState,
    groupWindowMs,
    locale = "pt-BR",
    now,
    placeholder,
    composerActions,
    composerDisabled,
    onSendError,
    className,
    ...rest
}: ChatProps) {
    const strings = chatStrings(locale);
    const sections = groupMessages({ messages, currentUserId, windowMs: groupWindowMs });
    const composer = useRef<ChatComposerHandle | null>(null);
    const thread = useRef<HTMLDivElement | null>(null);
    const stuckToBottom = useRef(true);

    /**
     * Remember whether the reader is at the bottom, before the next batch lands.
     *
     * A thread that always scrolls to the newest message yanks somebody out of the
     * history they were reading, every time anyone types. So the jump only happens
     * when they were already at the bottom — the same rule every chat app converges
     * on. The 48px slack covers a partially visible last row.
     */
    const trackPosition = (): void => {
        const node = thread.current;
        if (!node) return;
        const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
        stuckToBottom.current = distance < 48;
    };

    useLayoutEffect(() => {
        const node = thread.current;
        if (!node || !stuckToBottom.current) return;
        node.scrollTop = node.scrollHeight;
    }, [messages, typing]);

    useEffect(() => {
        const node = thread.current;
        if (!node) return;
        node.scrollTop = node.scrollHeight;
        // Mount lands on the newest message; from then on `trackPosition` decides.
    }, []);

    const typingText = typingLabel(typing, locale);

    return (
        <div className={cn(styles.panel, className)} {...rest}>
            {header && <header className={styles.header}>{header}</header>}

            <div
                ref={thread}
                className={styles.thread}
                onScroll={trackPosition}
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                tabIndex={0}
                aria-label={strings.thread}
            >
                {messages.length === 0
                    ? (emptyState ?? <EmptyState title={strings.empty} />)
                    : sections.map((section) =>
                          section.kind === "day" ? (
                              <div key={section.key} className={styles.day}>
                                  <span className={styles.dayLabel}>
                                      {dayLabel(section.date, { locale, now })}
                                  </span>
                              </div>
                          ) : (
                              <div
                                  key={section.key}
                                  className={cn(styles.run, section.own && styles.ownRun)}
                              >
                                  {renderAvatar && (
                                      <div className={styles.avatar} aria-hidden="true">
                                          {renderAvatar(section.messages[0])}
                                      </div>
                                  )}
                                  <div className={styles.runBody}>
                                      <span className={styles.author}>
                                          {section.own
                                              ? strings.you
                                              : (section.authorName ?? section.authorId)}
                                      </span>
                                      <ul className={styles.bubbles}>
                                          {section.messages.map((message) => (
                                              <li key={message.id} className={styles.bubbleRow}>
                                                  <div
                                                      className={cn(
                                                          styles.bubble,
                                                          section.own && styles.ownBubble,
                                                          message.status === "failed" &&
                                                              styles.failedBubble,
                                                      )}
                                                  >
                                                      <div className={styles.body}>
                                                          {message.body}
                                                      </div>
                                                      <div className={styles.meta}>
                                                          <time
                                                              dateTime={new Date(
                                                                  message.sentAt,
                                                              ).toISOString()}
                                                          >
                                                              {timeLabel(message.sentAt, locale)}
                                                          </time>
                                                          {section.own && message.status && (
                                                              <span
                                                                  className={cn(
                                                                      styles.status,
                                                                      message.status === "failed" &&
                                                                          styles.statusFailed,
                                                                  )}
                                                                  title={strings[message.status]}
                                                              >
                                                                  <span aria-hidden="true">
                                                                      {STATUS_GLYPH[message.status]}
                                                                  </span>
                                                                  <VisuallyHidden>
                                                                      {strings[message.status]}
                                                                  </VisuallyHidden>
                                                              </span>
                                                          )}
                                                      </div>
                                                  </div>
                                                  {message.status === "failed" && onRetry && (
                                                      <button
                                                          type="button"
                                                          className={styles.retry}
                                                          onClick={() => onRetry(message)}
                                                      >
                                                          {strings.retry}
                                                      </button>
                                                  )}
                                              </li>
                                          ))}
                                      </ul>
                                  </div>
                              </div>
                          ),
                      )}
            </div>

            {typingText && (
                <p className={styles.typing} aria-live="polite">
                    {typingText}
                </p>
            )}

            {onSend && (
                <ChatComposer
                    ref={composer}
                    onSend={onSend}
                    locale={locale}
                    placeholder={placeholder}
                    actions={composerActions}
                    disabled={composerDisabled}
                    onError={onSendError}
                />
            )}
        </div>
    );
}

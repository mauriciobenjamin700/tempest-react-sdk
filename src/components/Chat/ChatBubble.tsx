/**
 * @tempest-limits file-lines props-count function-lines — one bubble is one unit of
 * layout, and every part of it reads from the same message: the quote above the
 * body, the body or its tombstone, the attachments, the reactions under it, and the
 * timestamp with its ticks. Splitting them would pass the same message to six
 * components and put the bubble's geometry in none of them.
 */
import { Suspense, lazy, type ReactNode } from "react";

import { cn } from "@/utils/cn";

import type { ContextMenuItem } from "../ContextMenu";
import { VisuallyHidden } from "../VisuallyHidden";
import { chatStrings, timeLabel, type ChatMessage } from "./chat-groups";
import { receiptLabel, resolveReceiptState } from "./chat-receipt";
import styles from "./Chat.module.css";

const ChatAttachments = lazy(() =>
    import("./ChatAttachments").then((module) => ({ default: module.ChatAttachments })),
);

const ChatActionsMenu = lazy(() =>
    import("./ChatActionsMenu").then((module) => ({ default: module.ChatActionsMenu })),
);

/** Glyph per tick state. `delivered` is the one a boolean `status` cannot say. */
const RECEIPT_GLYPH = {
    sending: "◌",
    sent: "✓",
    delivered: "✓✓",
    read: "✓✓",
    failed: "!",
} as const;

export interface ChatBubbleProps {
    /** The message this bubble renders. */
    message: ChatMessage;
    /** Whether it belongs to the current user — side, colour and ticks. */
    own: boolean;
    /** Locale for labels. */
    locale: "pt-BR" | "en";
    /** Retry handler for a `"failed"` message. */
    onRetry?: (message: ChatMessage) => void;
    /** Toggles a reaction. Receives the emoji that was pressed. */
    onReact?: (message: ChatMessage, emoji: string) => void;
    /** Per-message actions, opened by right click, long press or the ⋮ button. */
    messageActions?: (message: ChatMessage) => ContextMenuItem[];
    /** Called when the quote stub is activated — scroll to the quoted message. */
    onQuoteClick?: (message: ChatMessage) => void;
}

/**
 * One message bubble.
 *
 * Everything a messenger needs on a single message lives here, because every one
 * of these was a thing each app rebuilt on top of a text-only bubble: the reply
 * stub, attachments, reactions, per-recipient ticks, the actions menu, and the
 * tombstone of a deleted message.
 *
 * @param props - The message and its handlers.
 * @returns The bubble, wrapped in a context menu when actions are given.
 */
export function ChatBubble({
    message,
    own,
    locale,
    onRetry,
    onReact,
    messageActions,
    onQuoteClick,
}: ChatBubbleProps) {
    const strings = chatStrings(locale);
    const receiptState = own ? resolveReceiptState(message) : null;
    const actions = message.deleted ? [] : (messageActions?.(message) ?? []);

    const bubble = (
        <div
            className={cn(
                styles.bubble,
                own && styles.ownBubble,
                message.deleted && styles.deletedBubble,
                message.status === "failed" && styles.failedBubble,
            )}
        >
            {message.quote && !message.deleted && (
                <QuoteStub message={message} locale={locale} onQuoteClick={onQuoteClick} />
            )}

            {message.deleted ? (
                <div className={styles.tombstone}>
                    <span aria-hidden="true">🚫</span> {strings.deleted}
                </div>
            ) : (
                <>
                    {message.attachments && message.attachments.length > 0 && (
                        <Suspense fallback={<div className={styles.attachmentsFallback} />}>
                            <ChatAttachments attachments={message.attachments} strings={strings} />
                        </Suspense>
                    )}
                    {message.body !== undefined && message.body !== null && message.body !== "" && (
                        <div className={styles.body}>{message.body}</div>
                    )}
                </>
            )}

            <div className={styles.meta}>
                {message.edited && !message.deleted && (
                    <span className={styles.edited}>{strings.edited}</span>
                )}
                <time dateTime={new Date(message.sentAt).toISOString()}>
                    {timeLabel(message.sentAt, locale)}
                </time>
                {receiptState && <Receipt message={message} state={receiptState} locale={locale} />}
            </div>
        </div>
    );

    return (
        <li className={styles.bubbleRow}>
            {actions.length > 0 ? (
                <Suspense fallback={bubble}>
                    <ChatActionsMenu items={actions} trigger="contextmenu">
                        {bubble}
                    </ChatActionsMenu>
                </Suspense>
            ) : (
                bubble
            )}

            {actions.length > 0 && (
                <Suspense fallback={null}>
                    <ChatActionsMenu items={actions} trigger="click">
                        <button
                            type="button"
                            className={styles.actionsButton}
                            aria-label={strings.messageActions}
                        >
                            <span aria-hidden="true">⋮</span>
                        </button>
                    </ChatActionsMenu>
                </Suspense>
            )}

            {message.reactions && message.reactions.length > 0 && (
                <ul className={styles.reactions} aria-label={strings.reactions}>
                    {message.reactions.map((reaction) => (
                        <li key={reaction.emoji}>
                            <button
                                type="button"
                                className={cn(
                                    styles.reaction,
                                    reaction.reacted && styles.reactionMine,
                                )}
                                aria-pressed={reaction.reacted ?? false}
                                title={reaction.names?.join(", ")}
                                disabled={!onReact}
                                onClick={() => onReact?.(message, reaction.emoji)}
                            >
                                <span aria-hidden="true">
                                    {reaction.emoji} {reaction.count}
                                </span>
                                <VisuallyHidden>
                                    {strings.react(reaction.emoji, reaction.count)}
                                </VisuallyHidden>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {message.status === "failed" && onRetry && (
                <button type="button" className={styles.retry} onClick={() => onRetry(message)}>
                    {strings.retry}
                </button>
            )}
        </li>
    );
}

/** The reply stub above a body, or its blanked form once the target is gone. */
function QuoteStub({
    message,
    locale,
    onQuoteClick,
}: {
    message: ChatMessage;
    locale: "pt-BR" | "en";
    onQuoteClick?: (message: ChatMessage) => void;
}): ReactNode {
    const strings = chatStrings(locale);
    const quote = message.quote;
    if (!quote) return null;
    const label = quote.revoked
        ? strings.quoteRevoked
        : (quote.excerpt ??
          (quote.kind && quote.kind !== "text" ? strings.quoteKind[quote.kind] : ""));

    const content = (
        <>
            <span className={styles.quoteAuthor}>
                {quote.senderName ?? strings.replyingTo(quote.messageId)}
            </span>
            <span className={cn(styles.quoteText, quote.revoked && styles.quoteRevoked)}>
                {label}
            </span>
        </>
    );

    return onQuoteClick ? (
        <button
            type="button"
            className={cn(styles.quote, styles.quoteButton)}
            onClick={() => onQuoteClick(message)}
        >
            {content}
        </button>
    ) : (
        <div className={styles.quote}>{content}</div>
    );
}

/** The ticks, and the sentence behind them. */
function Receipt({
    message,
    state,
    locale,
}: {
    message: ChatMessage;
    state: keyof typeof RECEIPT_GLYPH;
    locale: "pt-BR" | "en";
}): ReactNode {
    const strings = chatStrings(locale);
    const label =
        message.receipt && message.receipt.totalRecipients > 0 && state !== "failed"
            ? receiptLabel(message.receipt, strings)
            : strings[state === "delivered" ? "sent" : state];

    return (
        <span
            className={cn(
                styles.status,
                state === "read" && styles.statusRead,
                state === "failed" && styles.statusFailed,
            )}
            title={label}
        >
            <span aria-hidden="true">{RECEIPT_GLYPH[state]}</span>
            <VisuallyHidden>{label}</VisuallyHidden>
        </span>
    );
}

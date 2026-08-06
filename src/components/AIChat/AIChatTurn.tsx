/**
 * @tempest-limits file-lines, props-count, function-lines — one turn renders six
 * things that each have their own state: Markdown body, collapsible reasoning,
 * attachments, streaming caret, inline edit form and the action row. The 13 props
 * are the callbacks those actions need plus the render slots, and the body is long
 * because the edit form and the action row share the turn's message and its pending
 * state.
 */
import { ChevronRight, Copy, Pencil, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { cn } from "@/utils/cn";
import { formatBytes } from "@/utils/numbers";

import { Collapsible } from "../Collapsible";
import { CopyButton } from "../CopyButton";
import { Markdown } from "../Markdown";
import { VisuallyHidden } from "../VisuallyHidden";
import {
    aiChatStrings,
    roleLabel,
    turnTime,
    type AIChatMessage,
    type AIChatVote,
} from "./ai-chat-turns";
import styles from "./AIChat.module.css";

export interface AIChatTurnProps {
    /** The turn to render. */
    message: AIChatMessage;
    /** Locale for the labels. Default `"pt-BR"`. */
    locale?: "pt-BR" | "en";
    /**
     * Offer the regenerate control.
     *
     * Only the newest assistant turn should get it — re-asking an older one throws
     * away every turn after it, which is a different operation and needs its own
     * confirmation.
     */
    canRegenerate?: boolean;
    onRegenerate?: (message: AIChatMessage) => void;
    onFeedback?: (message: AIChatMessage, vote: AIChatVote) => void;
    /** Enables the edit control on a user turn. Receives the edited prompt. */
    onEditSubmit?: (message: AIChatMessage, text: string) => void | Promise<void>;
    /**
     * Called when `onEditSubmit` rejects. The editor stays open with the draft either
     * way.
     *
     * Without it the rejection is swallowed after the draft is preserved: re-throwing
     * out of a click handler surfaces as an unhandled promise rejection, which is
     * console noise for the developer and nothing the user can act on.
     */
    onEditError?: (error: unknown) => void;
    /** Enables the retry control on a turn that carries an `error`. */
    onRetry?: (message: AIChatMessage) => void;
    renderAvatar?: (message: AIChatMessage) => ReactNode;
    /** Render the body yourself — a tool-call card, a chart, a citation list. */
    renderContent?: (message: AIChatMessage) => ReactNode;
    /**
     * Rating to show as pressed.
     *
     * Pass it to keep votes in app state (persisted across a reload); leave it out
     * and the pressed state is kept locally, which is enough for a fire-and-forget
     * `onFeedback`.
     */
    vote?: AIChatVote;
    /** Reasoning blocks start expanded. Default `false`. */
    defaultReasoningOpen?: boolean;
    /** Show line numbers in fenced code. Default `false`. */
    showLineNumbers?: boolean;
}

/**
 * One turn of a conversation with a model.
 *
 * Exported for apps that build their own transcript layout (a split view, a diff of
 * two answers) but still want the SDK's turn: Markdown body, reasoning block,
 * attachments, streaming caret, error state and the action row.
 *
 * @example
 * <AIChatTurn message={turn} canRegenerate onRegenerate={(m) => reask(m)} />
 */
export function AIChatTurn({
    message,
    locale = "pt-BR",
    canRegenerate = false,
    onRegenerate,
    onFeedback,
    onEditSubmit,
    onEditError,
    onRetry,
    renderAvatar,
    renderContent,
    vote,
    defaultReasoningOpen = false,
    showLineNumbers = false,
}: AIChatTurnProps) {
    const strings = aiChatStrings(locale);
    const { role, content, reasoning, streaming, error, model, createdAt, attachments } = message;
    const [localVote, setLocalVote] = useState<AIChatVote | null>(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(content);
    const [saving, setSaving] = useState(false);

    const currentVote = vote ?? localVote;
    const isUser = role === "user";

    /**
     * Memoised so a streaming answer re-parses **only the turn that is growing**.
     *
     * `Markdown` parses in its own render, and React skips re-rendering a child whose
     * element is referentially identical to the previous one. Holding the element
     * across renders is therefore what keeps a fifty-turn transcript from re-parsing
     * every finished answer on every token of the newest one.
     */
    const markdown = useMemo(
        () => (
            <Markdown
                source={content}
                showLineNumbers={showLineNumbers}
                className={styles.markdownRoot}
            />
        ),
        [content, showLineNumbers],
    );

    /**
     * Body of the turn.
     *
     * A user turn is plain text with newlines preserved, an assistant turn is
     * Markdown. A model emits Markdown by contract; a person typing `2 * 3 * 4` did
     * not mean to open an emphasis span.
     */
    const body = ((): ReactNode => {
        if (renderContent) return renderContent(message);
        if (isUser) return <div className={styles.plain}>{content}</div>;
        if (content === "") return null;
        return markdown;
    })();

    const submitEdit = async (): Promise<void> => {
        const text = draft.trim();
        if (!text || saving || !onEditSubmit) return;
        setSaving(true);
        try {
            await onEditSubmit(message, text);
            setEditing(false);
        } catch (error) {
            onEditError?.(error);
        } finally {
            setSaving(false);
        }
    };

    const rate = (next: AIChatVote): void => {
        if (currentVote === next) return;
        setLocalVote(next);
        onFeedback?.(message, next);
    };

    const showActions = !streaming && !editing;
    const hasAssistantActions =
        onFeedback !== undefined || (canRegenerate && onRegenerate !== undefined);

    return (
        <article
            className={cn(
                styles.turn,
                isUser && styles.userTurn,
                role === "system" && styles.systemTurn,
                streaming && styles.streamingTurn,
            )}
            aria-busy={streaming || undefined}
            data-role={role}
        >
            <header className={styles.turnHeader}>
                {renderAvatar && (
                    <span className={styles.avatar} aria-hidden="true">
                        {renderAvatar(message)}
                    </span>
                )}
                <span className={cn(styles.role, isUser && styles.visuallyHiddenRole)}>
                    {roleLabel(role, strings)}
                </span>
                {model && !isUser && <span className={styles.model}>{model}</span>}
                {createdAt !== undefined && (
                    <time className={styles.time} dateTime={new Date(createdAt).toISOString()}>
                        {turnTime(createdAt, locale)}
                    </time>
                )}
            </header>

            {attachments && attachments.length > 0 && (
                <ul className={styles.attachments}>
                    {attachments.map((attachment) => (
                        <li key={attachment.id} className={styles.attachment}>
                            {attachment.url ? (
                                <img
                                    className={styles.thumb}
                                    src={attachment.url}
                                    alt={attachment.name}
                                />
                            ) : (
                                <>
                                    <span className={styles.attachmentName}>{attachment.name}</span>
                                    <span className={styles.attachmentMeta}>
                                        {attachment.size !== undefined
                                            ? formatBytes(attachment.size)
                                            : attachment.mimeType}
                                    </span>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {reasoning && (
                <Collapsible
                    className={styles.reasoning}
                    defaultOpen={defaultReasoningOpen || (streaming === true && content === "")}
                    trigger={
                        <>
                            <ChevronRight
                                className={styles.reasoningChevron}
                                size={14}
                                aria-hidden
                            />
                            {strings.reasoning}
                        </>
                    }
                >
                    <div className={styles.reasoningBody}>{reasoning}</div>
                </Collapsible>
            )}

            {editing ? (
                <div className={styles.editor}>
                    <VisuallyHidden>
                        <label htmlFor={`${message.id}-edit`}>{strings.editing}</label>
                    </VisuallyHidden>
                    <textarea
                        id={`${message.id}-edit`}
                        className={styles.editField}
                        value={draft}
                        rows={Math.min(draft.split("\n").length + 1, 10)}
                        onChange={(event) => setDraft(event.target.value)}
                    />
                    <div className={styles.editActions}>
                        <button
                            type="button"
                            className={styles.ghost}
                            onClick={() => {
                                setDraft(content);
                                setEditing(false);
                            }}
                        >
                            {strings.cancel}
                        </button>
                        <button
                            type="button"
                            className={styles.primary}
                            disabled={saving || draft.trim() === ""}
                            onClick={() => void submitEdit()}
                        >
                            {strings.save}
                        </button>
                    </div>
                </div>
            ) : (
                <div className={cn(styles.body, streaming && styles.streamingBody)}>
                    {body}
                    {streaming === true && content === "" && (
                        <span className={styles.dots} aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </span>
                    )}
                </div>
            )}

            {error && (
                <p className={styles.error} role="alert">
                    <span>{error}</span>
                    {onRetry && (
                        <button
                            type="button"
                            className={styles.retry}
                            onClick={() => onRetry(message)}
                        >
                            {strings.retry}
                        </button>
                    )}
                </p>
            )}

            {showActions && (
                <div className={styles.actions} aria-label={strings.turnActions} role="group">
                    <CopyButton
                        className={styles.action}
                        value={content}
                        aria-label={strings.copy}
                        title={strings.copy}
                    >
                        <Copy size={14} aria-hidden />
                    </CopyButton>

                    {isUser && onEditSubmit && (
                        <button
                            type="button"
                            className={styles.action}
                            aria-label={strings.edit}
                            title={strings.edit}
                            onClick={() => {
                                setDraft(content);
                                setEditing(true);
                            }}
                        >
                            <Pencil size={14} aria-hidden />
                        </button>
                    )}

                    {!isUser && hasAssistantActions && (
                        <>
                            {canRegenerate && onRegenerate && (
                                <button
                                    type="button"
                                    className={styles.action}
                                    aria-label={strings.regenerate}
                                    title={strings.regenerate}
                                    onClick={() => onRegenerate(message)}
                                >
                                    <RefreshCw size={14} aria-hidden />
                                </button>
                            )}
                            {onFeedback && (
                                <>
                                    <button
                                        type="button"
                                        className={cn(
                                            styles.action,
                                            currentVote === "up" && styles.actionActive,
                                        )}
                                        aria-label={strings.good}
                                        title={strings.good}
                                        aria-pressed={currentVote === "up"}
                                        onClick={() => rate("up")}
                                    >
                                        <ThumbsUp size={14} aria-hidden />
                                    </button>
                                    <button
                                        type="button"
                                        className={cn(
                                            styles.action,
                                            currentVote === "down" && styles.actionActive,
                                        )}
                                        aria-label={strings.bad}
                                        title={strings.bad}
                                        aria-pressed={currentVote === "down"}
                                        onClick={() => rate("down")}
                                    >
                                        <ThumbsDown size={14} aria-hidden />
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>
            )}
        </article>
    );
}

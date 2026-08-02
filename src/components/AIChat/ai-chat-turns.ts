/** Who produced a turn. */
export type AIChatRole = "user" | "assistant" | "system";

/** Rating an app can collect on an assistant turn. */
export type AIChatVote = "up" | "down";

/** A file carried by a turn — an upload on the way in, a document on the way out. */
export interface AIChatAttachment {
    /** Stable identity. Used as the React key. */
    id: string;
    /** Name shown in the chip. */
    name: string;
    /** Size in bytes. Formatted for display when given. */
    size?: number;
    /** Image URL. When set the attachment renders as a thumbnail instead of a chip. */
    url?: string;
    /** MIME type. Used as the chip's secondary label when there is no size. */
    mimeType?: string;
}

/** One turn of a conversation with a model. */
export interface AIChatMessage {
    /** Stable identity. Used as the React key and by every callback. */
    id: string;
    role: AIChatRole;
    /**
     * The text of the turn.
     *
     * An assistant turn is rendered as Markdown; a user turn is rendered as plain
     * text with newlines preserved. That asymmetry is deliberate: a model emits
     * Markdown by contract, while a person typing `2 * 3 * 4` did not mean to open
     * an emphasis span.
     */
    content: string;
    /**
     * Reasoning the model exposed before answering — extended thinking, a
     * chain-of-thought trace.
     *
     * Rendered in its own collapsible block above the answer, so a long trace never
     * pushes the answer off screen.
     */
    reasoning?: string;
    /**
     * The turn is still arriving.
     *
     * Shows the caret, marks the block `aria-busy`, and hides the action row —
     * copying or rating half an answer is never what somebody meant to do.
     */
    streaming?: boolean;
    /** Generation failed. Shown under whatever streamed, with the retry control. */
    error?: string;
    /** Epoch milliseconds. */
    createdAt?: number;
    /** Model that produced the turn. Shown in the meta row of an assistant turn. */
    model?: string;
    attachments?: readonly AIChatAttachment[];
    /** Anything the app wants to carry through to its own renderers. */
    data?: Record<string, unknown>;
}

/**
 * Turns to render, in order.
 *
 * System turns are dropped unless asked for: a system prompt is configuration, and
 * an app that shows it by default leaks its own instructions into the transcript.
 *
 * @param params.messages - The thread, oldest first. Never reordered.
 * @param params.showSystem - Keep `"system"` turns. Default `false`.
 * @returns The visible turns, in the given order.
 */
export function visibleTurns({
    messages,
    showSystem = false,
}: {
    messages: readonly AIChatMessage[];
    showSystem?: boolean;
}): AIChatMessage[] {
    return messages.filter((message) => showSystem || message.role !== "system");
}

/** Whether any turn in the thread is still streaming. */
export function isGenerating(messages: readonly AIChatMessage[]): boolean {
    return messages.some((message) => message.streaming === true);
}

/**
 * Id of the newest assistant turn, or `null` when there is none.
 *
 * Only that turn gets the regenerate control: re-asking an older one would throw
 * away every turn after it, which is a different operation ("branch here") and
 * needs its own confirmation.
 */
export function lastAssistantId(messages: readonly AIChatMessage[]): string | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role === "assistant") return messages[index].id;
    }
    return null;
}

/**
 * A value that changes whenever the tail of the thread grows.
 *
 * The scroll effect cannot depend on the `messages` array alone. Streaming appends
 * to the **last** turn, and an app that mutates that object in place — or that
 * re-renders from a store holding the same array identity — would keep the same
 * dependency while the text grows, so the view would stop following the answer.
 * Length of the array, identity of the tail and length of its text together cover
 * both shapes.
 *
 * @param messages - The thread, oldest first.
 * @returns An opaque signature; compare with `===`.
 */
export function tailSignature(messages: readonly AIChatMessage[]): string {
    const tail = messages[messages.length - 1];
    if (!tail) return "0";
    const reasoning = tail.reasoning?.length ?? 0;
    return `${messages.length}:${tail.id}:${tail.content.length}:${reasoning}:${tail.streaming ? 1 : 0}`;
}

/** Labels the conversation needs, per locale. */
export interface AIChatStrings {
    thread: string;
    empty: string;
    emptyHint: string;
    placeholder: string;
    send: string;
    stop: string;
    regenerate: string;
    copy: string;
    copied: string;
    edit: string;
    save: string;
    cancel: string;
    editing: string;
    good: string;
    bad: string;
    reasoning: string;
    thinking: string;
    generating: string;
    done: string;
    stopped: string;
    you: string;
    assistant: string;
    system: string;
    retry: string;
    jumpToLatest: string;
    attachment: string;
    turnActions: string;
}

const PT_BR: AIChatStrings = {
    thread: "Conversa",
    empty: "Comece a conversa",
    emptyHint: "Pergunte qualquer coisa.",
    placeholder: "Pergunte alguma coisa…",
    send: "Enviar",
    stop: "Parar",
    regenerate: "Gerar de novo",
    copy: "Copiar",
    copied: "Copiado",
    edit: "Editar",
    save: "Enviar edição",
    cancel: "Cancelar",
    editing: "Editando a mensagem",
    good: "Boa resposta",
    bad: "Resposta ruim",
    reasoning: "Raciocínio",
    thinking: "Pensando…",
    generating: "Gerando resposta",
    done: "Resposta concluída",
    stopped: "Geração interrompida",
    you: "Você",
    assistant: "Assistente",
    system: "Sistema",
    retry: "Tentar de novo",
    jumpToLatest: "Ir para a última mensagem",
    attachment: "Anexo",
    turnActions: "Ações da mensagem",
};

const EN: AIChatStrings = {
    thread: "Conversation",
    empty: "Start the conversation",
    emptyHint: "Ask anything.",
    placeholder: "Ask anything…",
    send: "Send",
    stop: "Stop",
    regenerate: "Regenerate",
    copy: "Copy",
    copied: "Copied",
    edit: "Edit",
    save: "Send edit",
    cancel: "Cancel",
    editing: "Editing the message",
    good: "Good response",
    bad: "Bad response",
    reasoning: "Reasoning",
    thinking: "Thinking…",
    generating: "Generating a response",
    done: "Response complete",
    stopped: "Generation stopped",
    you: "You",
    assistant: "Assistant",
    system: "System",
    retry: "Try again",
    jumpToLatest: "Jump to the latest message",
    attachment: "Attachment",
    turnActions: "Message actions",
};

/** Locale strings for the conversation. */
export function aiChatStrings(locale: "pt-BR" | "en"): AIChatStrings {
    return locale === "en" ? EN : PT_BR;
}

/** Role label used in the turn header and by screen readers. */
export function roleLabel(role: AIChatRole, strings: AIChatStrings): string {
    if (role === "user") return strings.you;
    if (role === "assistant") return strings.assistant;
    return strings.system;
}

/**
 * Clock label for a turn — the time, not a relative phrase.
 *
 * A transcript is read top to bottom in one sitting, so "há 2 minutos" on every turn
 * is noise that also has to be re-rendered on a timer. The wall clock is stable and
 * enough to answer the only question anyone asks of it ("was this today?").
 */
export function turnTime(timestamp: number, locale: "pt-BR" | "en" = "pt-BR"): string {
    return new Date(timestamp).toLocaleTimeString(locale === "en" ? "en-US" : "pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

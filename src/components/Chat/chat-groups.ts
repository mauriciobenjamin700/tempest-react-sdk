import type { ReactNode } from "react";

/** What a bubble can carry besides text. */
export type ChatAttachmentKind = "image" | "video" | "audio" | "voice" | "file";

/** One attachment on a message. */
export interface ChatAttachment {
    /** Decides how it renders: a picture, a player, a voice note, a download row. */
    kind: ChatAttachmentKind;
    /** Where the bytes are. A blob URL works for a message still uploading. */
    url: string;
    /** File name, shown for `"file"` and used as the download name. */
    name?: string;
    /** MIME type, when the app knows it. */
    mimeType?: string;
    /** Size in bytes, shown next to a file. */
    sizeBytes?: number;
    /** Duration in ms, for audio, voice and video. */
    durationMs?: number;
    /** Poster for a video, or a smaller copy of an image. */
    thumbnailUrl?: string;
    /**
     * Normalised peaks, `0`–`1`, for a voice note.
     *
     * A voice note without one is a grey rectangle: the waveform is what tells
     * somebody whether this is a word or a two-minute monologue.
     */
    waveform?: readonly number[];
    /** Alternative text for an image. */
    alt?: string;
}

/**
 * The stub of the message being replied to, shown above the body.
 *
 * `revoked` is not decoration: deleting the quoted message has to blank the
 * quoted text, or it leaks through everyone who replied to it.
 */
export interface ChatQuote {
    /** Id of the quoted message, so the app can scroll to it. */
    messageId: string;
    /** Who wrote it. */
    senderName?: string;
    /** A short piece of what it said. The component never truncates for you. */
    excerpt?: string;
    /** What the quoted message was, when it was not text. */
    kind?: "text" | ChatAttachmentKind;
    /** The quoted message was deleted — the excerpt is not shown. */
    revoked?: boolean;
}

/** One emoji on a message, with its tally. */
export interface ChatReaction {
    /** The emoji itself. */
    emoji: string;
    /** How many people reacted with it. */
    count: number;
    /** Whether the current user is one of them — the chip reads as pressed. */
    reacted?: boolean;
    /** Who reacted, for the chip's tooltip. */
    names?: readonly string[];
}

/**
 * Per-recipient delivery, which is what a group needs.
 *
 * `status` is a boolean for the sender: it cannot say "delivered to everyone"
 * versus "read by everyone", and only the second one turns the ticks blue.
 */
export interface ChatReceipt {
    /** How many recipients have received it. */
    deliveredTo: number;
    /** How many have read it. */
    readBy: number;
    /** How many recipients there are. */
    totalRecipients: number;
}

/** One entry in a thread. */
export interface ChatMessage {
    /** Stable identity. Used as the React key and by `onRetry`. */
    id: string;
    /**
     * What was said. A node, so an app can render a link, an image or a quote.
     *
     * Optional, because a message can be all attachment, or be a tombstone: a
     * deleted message has no body to show, and requiring one made every app
     * invent a placeholder string for the state the component now owns.
     */
    body?: ReactNode;
    /** Who said it. Compared against `currentUserId` to decide sides. */
    authorId: string;
    /** Display name. Falls back to `authorId` in the header of a run. */
    authorName?: string;
    /** Epoch milliseconds. */
    sentAt: number;
    /**
     * Delivery state of an outgoing message.
     *
     * `"failed"` is the one that matters: without it an app has to invent its own
     * way to say "this never left", and the user re-types a message that is
     * sitting right there.
     */
    status?: "sending" | "sent" | "read" | "failed";
    /**
     * Per-recipient delivery. Takes precedence over `status` for the ticks.
     *
     * Use it in a group, where "delivered to all" and "read by all" are different
     * states and `status` can only say one thing.
     */
    receipt?: ChatReceipt;
    /** Media, voice notes and documents carried by this message. */
    attachments?: readonly ChatAttachment[];
    /** The message this one replies to. */
    quote?: ChatQuote;
    /** Emoji reactions, already tallied by the app. */
    reactions?: readonly ChatReaction[];
    /**
     * The message was deleted — it renders as a tombstone.
     *
     * A state, not a `body` the app swaps for a string: as a state the quote of
     * it can be blanked too, and every app stops writing its own wording.
     */
    deleted?: boolean;
    /** The message was edited after it was sent. */
    edited?: boolean;
    /** Anything the app wants to carry through to its own renderers. */
    data?: Record<string, unknown>;
}

/** A run of consecutive messages from one author, under one day. */
export interface ChatRun {
    kind: "run";
    /** `${authorId}-${first message id}` — stable across re-renders. */
    key: string;
    authorId: string;
    authorName?: string;
    /** Whether this run belongs to the current user. */
    own: boolean;
    messages: ChatMessage[];
}

/** A date heading between runs. */
export interface ChatDay {
    kind: "day";
    key: string;
    /** Midnight of that local day, epoch ms — the label is formatted by the view. */
    date: number;
}

export type ChatSection = ChatDay | ChatRun;

/** Default window in which consecutive messages from one author stay in a run. */
export const DEFAULT_GROUP_WINDOW_MS = 5 * 60 * 1000;

/** Local midnight of an instant, epoch ms. */
function startOfDay(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

/**
 * Turn a flat message list into the sections a thread renders: a date heading
 * whenever the local day changes, and runs of consecutive messages from the same
 * author.
 *
 * Grouping is what makes a thread readable — repeating the avatar and the name on
 * every line of a five-line burst turns a conversation into a list of receipts.
 * The run breaks on a different author, a different day, or a gap longer than
 * `windowMs`: a reply an hour later is a new beat in the conversation even when
 * nobody else spoke, and joining it to the earlier burst would put one timestamp
 * on messages an hour apart.
 *
 * Order is taken as given, oldest first, and never sorted here: a thread that
 * reorders what the server sent would fight optimistic inserts, where the
 * pending message is deliberately last.
 *
 * @param params.messages - Oldest first.
 * @param params.currentUserId - Author id treated as "own".
 * @param params.windowMs - Gap that still keeps a run together. Default 5 min.
 * @returns Sections in render order.
 */
export function groupMessages({
    messages,
    currentUserId,
    windowMs = DEFAULT_GROUP_WINDOW_MS,
}: {
    messages: readonly ChatMessage[];
    currentUserId?: string;
    windowMs?: number;
}): ChatSection[] {
    const sections: ChatSection[] = [];
    let day: number | null = null;
    let run: ChatRun | null = null;

    for (const message of messages) {
        const messageDay = startOfDay(message.sentAt);
        if (messageDay !== day) {
            day = messageDay;
            run = null;
            sections.push({ kind: "day", key: `day-${messageDay}`, date: messageDay });
        }

        const previous = run?.messages[run.messages.length - 1];
        const continues =
            run !== null &&
            previous !== undefined &&
            run.authorId === message.authorId &&
            message.sentAt - previous.sentAt <= windowMs;

        if (continues && run) {
            run.messages.push(message);
            continue;
        }

        run = {
            kind: "run",
            key: `${message.authorId}-${message.id}`,
            authorId: message.authorId,
            authorName: message.authorName,
            own: currentUserId !== undefined && message.authorId === currentUserId,
            messages: [message],
        };
        sections.push(run);
    }

    return sections;
}

/** Labels the thread needs, per locale. */
interface ChatStrings {
    thread: string;
    today: string;
    yesterday: string;
    you: string;
    typingOne: (name: string) => string;
    typingTwo: (a: string, b: string) => string;
    typingMany: (n: number) => string;
    sending: string;
    sent: string;
    read: string;
    failed: string;
    retry: string;
    empty: string;
    placeholder: string;
    send: string;
    deleted: string;
    edited: string;
    replyingTo: (name: string) => string;
    quoteRevoked: string;
    quoteKind: Record<ChatAttachmentKind, string>;
    reactions: string;
    react: (emoji: string, count: number) => string;
    deliveredAll: string;
    deliveredSome: (delivered: number, total: number) => string;
    readAll: string;
    readSome: (read: number, total: number) => string;
    messageActions: string;
    voiceNote: string;
    download: string;
}

const PT_BR: ChatStrings = {
    thread: "Conversa",
    today: "Hoje",
    yesterday: "Ontem",
    you: "Você",
    typingOne: (name) => `${name} está digitando…`,
    typingTwo: (a, b) => `${a} e ${b} estão digitando…`,
    typingMany: (n) => `${n} pessoas estão digitando…`,
    sending: "Enviando",
    sent: "Enviada",
    read: "Lida",
    failed: "Falhou ao enviar",
    retry: "Tentar de novo",
    empty: "Nenhuma mensagem ainda",
    placeholder: "Escreva uma mensagem",
    send: "Enviar",
    deleted: "Esta mensagem foi apagada",
    edited: "editada",
    replyingTo: (name) => `Em resposta a ${name}`,
    quoteRevoked: "Mensagem apagada",
    quoteKind: {
        image: "Foto",
        video: "Vídeo",
        audio: "Áudio",
        voice: "Mensagem de voz",
        file: "Documento",
    },
    reactions: "Reações",
    react: (emoji, count) => `${emoji}, ${count} ${count === 1 ? "pessoa" : "pessoas"}`,
    deliveredAll: "Entregue a todos",
    deliveredSome: (delivered, total) => `Entregue a ${delivered} de ${total}`,
    readAll: "Lida por todos",
    readSome: (read, total) => `Lida por ${read} de ${total}`,
    messageActions: "Ações da mensagem",
    voiceNote: "Mensagem de voz",
    download: "Baixar",
};

const EN: ChatStrings = {
    thread: "Conversation",
    today: "Today",
    yesterday: "Yesterday",
    you: "You",
    typingOne: (name) => `${name} is typing…`,
    typingTwo: (a, b) => `${a} and ${b} are typing…`,
    typingMany: (n) => `${n} people are typing…`,
    sending: "Sending",
    sent: "Sent",
    read: "Read",
    failed: "Failed to send",
    retry: "Try again",
    empty: "No messages yet",
    placeholder: "Write a message",
    send: "Send",
    deleted: "This message was deleted",
    edited: "edited",
    replyingTo: (name) => `Replying to ${name}`,
    quoteRevoked: "Message deleted",
    quoteKind: {
        image: "Photo",
        video: "Video",
        audio: "Audio",
        voice: "Voice message",
        file: "Document",
    },
    reactions: "Reactions",
    react: (emoji, count) => `${emoji}, ${count} ${count === 1 ? "person" : "people"}`,
    deliveredAll: "Delivered to everyone",
    deliveredSome: (delivered, total) => `Delivered to ${delivered} of ${total}`,
    readAll: "Read by everyone",
    readSome: (read, total) => `Read by ${read} of ${total}`,
    messageActions: "Message actions",
    voiceNote: "Voice message",
    download: "Download",
};

/** Locale strings for the thread. */
export function chatStrings(locale: "pt-BR" | "en"): ChatStrings {
    return locale === "en" ? EN : PT_BR;
}

/**
 * Label for a date heading: `"Hoje"`, `"Ontem"`, or the formatted date.
 *
 * @param date - Local midnight of the day being labelled.
 * @param params.now - Reference instant, so tests and SSR-free renders are stable.
 */
export function dayLabel(
    date: number,
    { locale = "pt-BR", now }: { locale?: "pt-BR" | "en"; now?: number } = {},
): string {
    const strings = chatStrings(locale);
    const today = startOfDay(now ?? Date.now());
    const dayMs = 24 * 60 * 60 * 1000;
    if (date === today) return strings.today;
    if (date === today - dayMs) return strings.yesterday;
    return new Date(date).toLocaleDateString(locale === "en" ? "en-US" : "pt-BR", {
        day: "2-digit",
        month: "short",
        year: date < today - 300 * dayMs ? "numeric" : undefined,
    });
}

/** Clock label for a single message — the time, not a relative phrase. */
export function timeLabel(timestamp: number, locale: "pt-BR" | "en" = "pt-BR"): string {
    return new Date(timestamp).toLocaleTimeString(locale === "en" ? "en-US" : "pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** Sentence for the typing indicator, or `null` when nobody is typing. */
export function typingLabel(
    names: readonly string[],
    locale: "pt-BR" | "en" = "pt-BR",
): string | null {
    const strings = chatStrings(locale);
    if (names.length === 0) return null;
    if (names.length === 1) return strings.typingOne(names[0]);
    if (names.length === 2) return strings.typingTwo(names[0], names[1]);
    return strings.typingMany(names.length);
}

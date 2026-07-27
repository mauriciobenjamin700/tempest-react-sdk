import type { ReactNode } from "react";

/** One entry in a thread. */
export interface ChatMessage {
    /** Stable identity. Used as the React key and by `onRetry`. */
    id: string;
    /** What was said. A node, so an app can render a link, an image or a quote. */
    body: ReactNode;
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

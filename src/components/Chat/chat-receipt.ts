import type { ChatMessage, ChatReceipt } from "./chat-groups";

/**
 * What the ticks on an outgoing message say.
 *
 * `"read"` is the only one that turns them blue, and in a group that means
 * **everyone** has read it — the distinction `status: "read"` cannot make.
 */
export type ChatReceiptState = "sending" | "sent" | "delivered" | "read" | "failed";

/**
 * Resolve the tick state of an outgoing message.
 *
 * A group needs three states where a single message has two: sent to the server,
 * delivered to the recipients, read by the recipients. A boolean `status` collapses
 * the middle one, so an app that has per-recipient counts either invents its own
 * glyph or shows a message as read when one person out of nine opened it.
 *
 * The counts win when they are there, and the thresholds are deliberately "all":
 * blue ticks in every messenger mean the whole room, and reporting "read" for a
 * partial count is the failure that makes people distrust the indicator entirely.
 * A `totalRecipients` of zero — a note to self, a thread whose membership the app
 * does not track — falls back to `status`, because "read by all of nobody" is not
 * a claim worth making.
 *
 * `"failed"` and `"sending"` come from `status` regardless: they are about this
 * side of the wire, and no recipient count exists yet.
 *
 * @param message - The message being rendered.
 * @returns The tick state, or `null` when there is nothing to show.
 */
export function resolveReceiptState(message: ChatMessage): ChatReceiptState | null {
    if (message.status === "failed" || message.status === "sending") return message.status;
    const receipt = message.receipt;
    if (!receipt || receipt.totalRecipients <= 0) return message.status ?? null;
    if (receipt.readBy >= receipt.totalRecipients) return "read";
    if (receipt.deliveredTo >= receipt.totalRecipients) return "delivered";
    return message.status ?? "sent";
}

/**
 * The sentence a reader gets for a receipt, for the tooltip and the screen reader.
 *
 * Partial counts are spelled out rather than rounded to a state: "delivered to 3
 * of 9" is the information the sender actually wants when the ticks are not blue
 * yet, and it is the part a glyph cannot carry.
 *
 * @param receipt - Per-recipient counts.
 * @param strings - Locale strings for the thread.
 * @returns One sentence describing delivery and reading.
 */
export function receiptLabel(
    receipt: ChatReceipt,
    strings: {
        deliveredAll: string;
        deliveredSome: (delivered: number, total: number) => string;
        readAll: string;
        readSome: (read: number, total: number) => string;
    },
): string {
    const { deliveredTo, readBy, totalRecipients } = receipt;
    if (readBy >= totalRecipients) return strings.readAll;
    if (readBy > 0) return strings.readSome(readBy, totalRecipients);
    if (deliveredTo >= totalRecipients) return strings.deliveredAll;
    return strings.deliveredSome(deliveredTo, totalRecipients);
}

import { describe, expect, it } from "vitest";

import type { ChatMessage } from "./chat-groups";
import { receiptLabel, resolveReceiptState } from "./chat-receipt";

/**
 * Per-recipient receipts, which is the part `status` cannot express.
 *
 * `status: "read"` is a boolean for the sender. In a group the three states that
 * matter are sent, delivered to everyone, read by everyone — and only the last
 * one turns the ticks. Collapsing the middle one is how an app ends up showing a
 * message as read because one person out of nine opened it.
 */

const base: ChatMessage = { id: "m1", body: "oi", authorId: "me", sentAt: 0 };

describe("resolveReceiptState", () => {
    it("says read only when everyone has read it", () => {
        expect(
            resolveReceiptState({
                ...base,
                receipt: { deliveredTo: 9, readBy: 9, totalRecipients: 9 },
            }),
        ).toBe("read");
        expect(
            resolveReceiptState({
                ...base,
                receipt: { deliveredTo: 9, readBy: 8, totalRecipients: 9 },
            }),
        ).toBe("delivered");
    });

    it("distinguishes delivered-to-all from a partial delivery", () => {
        expect(
            resolveReceiptState({
                ...base,
                status: "sent",
                receipt: { deliveredTo: 3, readBy: 0, totalRecipients: 9 },
            }),
        ).toBe("sent");
        expect(
            resolveReceiptState({
                ...base,
                receipt: { deliveredTo: 9, readBy: 0, totalRecipients: 9 },
            }),
        ).toBe("delivered");
    });

    /**
     * "Read by all of nobody" is not a claim worth making, so a thread whose
     * membership the app does not track falls back to the single status.
     */
    it("falls back to status when there are no recipients to count", () => {
        expect(
            resolveReceiptState({
                ...base,
                status: "sent",
                receipt: { deliveredTo: 0, readBy: 0, totalRecipients: 0 },
            }),
        ).toBe("sent");
        expect(resolveReceiptState({ ...base, status: "read" })).toBe("read");
        expect(resolveReceiptState(base)).toBeNull();
    });

    it("keeps failed and sending, which are about this side of the wire", () => {
        expect(
            resolveReceiptState({
                ...base,
                status: "failed",
                receipt: { deliveredTo: 9, readBy: 9, totalRecipients: 9 },
            }),
        ).toBe("failed");
        expect(
            resolveReceiptState({
                ...base,
                status: "sending",
                receipt: { deliveredTo: 1, readBy: 0, totalRecipients: 9 },
            }),
        ).toBe("sending");
    });
});

describe("receiptLabel", () => {
    const strings = {
        deliveredAll: "Entregue a todos",
        deliveredSome: (delivered: number, total: number) => `Entregue a ${delivered} de ${total}`,
        readAll: "Lida por todos",
        readSome: (read: number, total: number) => `Lida por ${read} de ${total}`,
    };

    /**
     * A partial count is spelled out rather than rounded to a state: it is the
     * information the sender wants exactly when the ticks are not blue yet, and
     * it is the part a glyph cannot carry.
     */
    it("spells out the partial counts", () => {
        expect(receiptLabel({ deliveredTo: 9, readBy: 3, totalRecipients: 9 }, strings)).toBe(
            "Lida por 3 de 9",
        );
        expect(receiptLabel({ deliveredTo: 4, readBy: 0, totalRecipients: 9 }, strings)).toBe(
            "Entregue a 4 de 9",
        );
    });

    it("uses the whole-room phrasing at the thresholds", () => {
        expect(receiptLabel({ deliveredTo: 9, readBy: 9, totalRecipients: 9 }, strings)).toBe(
            "Lida por todos",
        );
        expect(receiptLabel({ deliveredTo: 9, readBy: 0, totalRecipients: 9 }, strings)).toBe(
            "Entregue a todos",
        );
    });
});

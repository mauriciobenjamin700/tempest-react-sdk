import { describe, expect, it } from "vitest";

import { CARD_STATUS_DETAIL_MESSAGES, describeCardCharge } from "./outcome";
import { isFinalPaymentStatus } from "./types";
import type { PaymentStatus } from "./types";

describe("CARD_STATUS_DETAIL_MESSAGES", () => {
    it("covers every status_detail Mercado Pago's Orders API documents for a card, and nothing else", () => {
        expect(Object.keys(CARD_STATUS_DETAIL_MESSAGES).sort()).toEqual(
            [
                "3ds_challenge_expired",
                "amount_limit_exceeded",
                "bad_filled_card_data",
                "card_disabled",
                "card_insufficient_amount",
                "high_risk",
                "in_process",
                "in_review",
                "insufficient_amount",
                "invalid_card_token",
                "invalid_installments",
                "max_attempts_exceeded",
                "pending_challenge",
                "pending_review_manual",
                "processing_error",
                "rejected_by_issuer",
                "required_call_for_authorize",
                "waiting_capture",
            ].sort(),
        );
    });

    it("never tells the payer the anti-fraud system flagged them", () => {
        expect(CARD_STATUS_DETAIL_MESSAGES.high_risk).not.toMatch(/fraude|risco/i);
    });
});

describe("describeCardCharge", () => {
    it("reads the sandbox decline (rejected_by_issuer) as a retryable refusal, not an error", () => {
        const outcome = describeCardCharge({
            status: "failed",
            status_detail: "rejected_by_issuer",
        });
        expect(outcome).toEqual({
            status: "failed",
            tone: "danger",
            title: "Pagamento recusado",
            message: CARD_STATUS_DETAIL_MESSAGES.rejected_by_issuer,
            canRetry: true,
        });
    });

    it("reads waiting_capture as its own authorized state, never as paid", () => {
        const outcome = describeCardCharge({
            status: "authorized",
            status_detail: "waiting_capture",
        });
        expect(outcome.status).toBe("authorized");
        expect(outcome.tone).toBe("info");
        expect(outcome.title).toBe("Pagamento autorizado");
        expect(outcome.message).toMatch(/reservado/);
    });

    it("keeps the generic approval text for paid, whatever the detail says", () => {
        expect(describeCardCharge({ status: "paid", status_detail: "accredited" }).message).toBe(
            "Recebemos o seu pagamento.",
        );
        expect(
            describeCardCharge({ status: "paid", status_detail: "partially_refunded" }).title,
        ).toBe("Pagamento aprovado");
    });

    it("falls back to the status text for a detail it does not know", () => {
        const outcome = describeCardCharge({ status: "failed", status_detail: "brand_new_reason" });
        expect(outcome.message).toBe(
            "O pagamento não foi aprovado. Tente outro cartão ou outro meio de pagamento.",
        );
    });

    it("does not let a detail contradict its status", () => {
        expect(
            describeCardCharge({ status: "failed", status_detail: "waiting_capture" }).message,
        ).not.toMatch(/reservado/);
        expect(
            describeCardCharge({ status: "pending", status_detail: "rejected_by_issuer" }).message,
        ).toBe("O pagamento ainda não foi concluído.");
    });

    it("reads a status this version does not know as unknown", () => {
        const outcome = describeCardCharge({
            status: "on_the_moon" as PaymentStatus,
            status_detail: null,
        });
        expect(outcome.status).toBe("unknown");
        expect(outcome.title).toBe("Verificando o pagamento");
    });

    it("lets the app override the text per detail", () => {
        const outcome = describeCardCharge(
            { status: "failed", status_detail: "rejected_by_issuer" },
            { rejected_by_issuer: "Card declined by the issuer." },
        );
        expect(outcome.message).toBe("Card declined by the issuer.");
    });

    it("refines an in-analysis charge with the review detail", () => {
        expect(
            describeCardCharge({ status: "in_analysis", status_detail: "pending_review_manual" })
                .message,
        ).toBe(CARD_STATUS_DETAIL_MESSAGES.pending_review_manual);
    });
});

describe("isFinalPaymentStatus", () => {
    it("stops following on the six states the backend will not move from the checkout's point of view", () => {
        const all: PaymentStatus[] = [
            "pending",
            "authorized",
            "paid",
            "expired",
            "cancelled",
            "refunded",
            "charged_back",
            "in_analysis",
            "failed",
            "unknown",
        ];
        expect(all.filter(isFinalPaymentStatus)).toEqual([
            "paid",
            "expired",
            "cancelled",
            "refunded",
            "charged_back",
            "failed",
        ]);
    });
});

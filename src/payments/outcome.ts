import type { CardCharge, PaymentStatus } from "./types";

/** Visual tone of an outcome, matching `Alert`'s variants. */
export type PaymentOutcomeTone = "success" | "info" | "warning" | "danger" | "neutral";

/** What a card charge means to the payer, ready to render. */
export interface PaymentOutcome {
    /** The canonical state the outcome was derived from. */
    status: PaymentStatus;
    /** Tone for the surrounding `Alert`/`Badge`. */
    tone: PaymentOutcomeTone;
    /** Short headline. */
    title: string;
    /** One sentence telling the payer what happened and what to do. */
    message: string;
    /** Whether the payer can fix it from the checkout (another card, other data). */
    canRetry: boolean;
}

const WAITING_CAPTURE_MESSAGE =
    "O valor foi reservado no seu cartão e só será cobrado quando o pedido for confirmado.";

/**
 * PT-BR text for every `status_detail` Mercado Pago's Orders API documents.
 *
 * Ported from Mercado Pago's "Status da transação" table
 * (`developers/pt/docs/checkout-api-orders/payment-management/status/transaction-status`,
 * read on 2026-11-14), rewritten for the payer: the provider's descriptions are
 * addressed to the integrator. `rejected_by_issuer` is the decline the backend
 * pinned in the sandbox (holder `OTHE`, HTTP 402); the others come from the
 * table. `high_risk` deliberately does not say "fraud" — telling the payer the
 * anti-fraud system flagged them helps exactly the person it should not.
 *
 * A test pins every key, so a code dropped or renamed here fails instead of
 * silently falling back to the generic text.
 */
export const CARD_STATUS_DETAIL_MESSAGES: Readonly<Record<string, string>> = {
    bad_filled_card_data: "Confira os dados do cartão: número, validade e código de segurança.",
    invalid_card_token: "Não conseguimos validar o cartão. Preencha os dados de novo.",
    high_risk: "O pagamento não foi aprovado. Tente outro cartão ou outro meio de pagamento.",
    rejected_by_issuer:
        "O banco emissor recusou o pagamento. Use outro cartão ou fale com o banco.",
    required_call_for_authorize:
        "O banco pede que você autorize este pagamento. Fale com o banco e tente de novo.",
    max_attempts_exceeded:
        "Você atingiu o limite de tentativas com este cartão. Use outro cartão ou outro meio de pagamento.",
    card_disabled: "O cartão está bloqueado ou inativo. Ative-o com o banco ou use outro cartão.",
    insufficient_amount:
        "O cartão não tem limite suficiente. Use outro cartão ou outro meio de pagamento.",
    card_insufficient_amount:
        "O cartão não tem limite suficiente. Use outro cartão ou outro meio de pagamento.",
    amount_limit_exceeded: "O valor passa do limite permitido para este cartão. Use outro cartão.",
    processing_error: "Não conseguimos processar o pagamento. Tente de novo em instantes.",
    invalid_installments: "O cartão não aceita esse número de parcelas. Escolha outra opção.",
    "3ds_challenge_expired":
        "O tempo para confirmar a compra no app do banco acabou. Tente de novo.",
    waiting_capture: WAITING_CAPTURE_MESSAGE,
    pending_challenge: "Confirme a compra no app do seu banco para concluir o pagamento.",
    pending_review_manual: "O pagamento está em análise. Avisaremos assim que for concluído.",
    in_review: "O pagamento está em análise. Avisaremos assim que for concluído.",
    in_process: "O pagamento está sendo processado. Avisaremos assim que for concluído.",
};

const DECLINE_DETAILS: ReadonlySet<string> = new Set([
    "bad_filled_card_data",
    "invalid_card_token",
    "high_risk",
    "rejected_by_issuer",
    "required_call_for_authorize",
    "max_attempts_exceeded",
    "card_disabled",
    "insufficient_amount",
    "card_insufficient_amount",
    "amount_limit_exceeded",
    "processing_error",
    "invalid_installments",
    "3ds_challenge_expired",
]);

const STATUS_OUTCOMES: Readonly<Record<PaymentStatus, Omit<PaymentOutcome, "status">>> = {
    paid: {
        tone: "success",
        title: "Pagamento aprovado",
        message: "Recebemos o seu pagamento.",
        canRetry: false,
    },
    authorized: {
        tone: "info",
        title: "Pagamento autorizado",
        message: WAITING_CAPTURE_MESSAGE,
        canRetry: false,
    },
    pending: {
        tone: "info",
        title: "Aguardando pagamento",
        message: "O pagamento ainda não foi concluído.",
        canRetry: false,
    },
    in_analysis: {
        tone: "info",
        title: "Pagamento em análise",
        message: "O pagamento está em análise. Avisaremos assim que for concluído.",
        canRetry: false,
    },
    failed: {
        tone: "danger",
        title: "Pagamento recusado",
        message: "O pagamento não foi aprovado. Tente outro cartão ou outro meio de pagamento.",
        canRetry: true,
    },
    expired: {
        tone: "warning",
        title: "Pagamento expirado",
        message: "O prazo para pagar acabou. Comece um novo pagamento.",
        canRetry: true,
    },
    cancelled: {
        tone: "neutral",
        title: "Pagamento cancelado",
        message: "Esta cobrança foi cancelada e não será cobrada.",
        canRetry: false,
    },
    refunded: {
        tone: "neutral",
        title: "Pagamento estornado",
        message: "O valor foi devolvido a você.",
        canRetry: false,
    },
    charged_back: {
        tone: "warning",
        title: "Pagamento contestado",
        message: "O pagamento foi contestado junto ao banco.",
        canRetry: false,
    },
    unknown: {
        tone: "neutral",
        title: "Verificando o pagamento",
        message: "Ainda estamos confirmando o estado deste pagamento.",
        canRetry: false,
    },
};

/**
 * Turn a card charge from the backend into what the payer should read.
 *
 * The **status** decides the outcome; `status_detail` only refines the sentence.
 * That ordering is the point: `waiting_capture` arrives as `authorized` and
 * reads as "reserved, not charged", never as paid, and a detail this table does
 * not know falls back to the status's generic text instead of guessing. A
 * decline reason only refines a `failed` charge, and a pending reason only a
 * charge that is not `failed`, so a detail that contradicts its status cannot
 * put "recusado" and "reservado" on the same screen.
 *
 * A decline is data here, not an exception. The backend returns a declined card
 * as a `CardCharge` with `status: "failed"` — Mercado Pago answers it with HTTP
 * 402 and the backend reads that as a result — so the checkout renders the
 * reason the same way it renders an approval. If your own endpoint chooses to
 * answer a decline with a non-2xx status, parse its body and pass it here; do
 * not show it as a network error, because it is not one.
 *
 * @param charge - The charge, or just its `status` and `status_detail`.
 * @param messages - Overrides per `status_detail`, merged over
 *   {@link CARD_STATUS_DETAIL_MESSAGES} — for another language or tone.
 * @returns Tone, title, message and whether the payer can retry.
 *
 * @example
 * const outcome = describeCardCharge(charge);
 * <Alert variant={outcome.tone} title={outcome.title} description={outcome.message} />
 */
export function describeCardCharge(
    charge: Pick<CardCharge, "status" | "status_detail">,
    messages: Readonly<Record<string, string>> = {},
): PaymentOutcome {
    const base = STATUS_OUTCOMES[charge.status] ?? STATUS_OUTCOMES.unknown;
    const status: PaymentStatus = charge.status in STATUS_OUTCOMES ? charge.status : "unknown";
    const detail = charge.status_detail ?? "";
    const matches =
        detail !== "" && status !== "paid" && DECLINE_DETAILS.has(detail) === (status === "failed");
    const refined = matches ? (messages[detail] ?? CARD_STATUS_DETAIL_MESSAGES[detail]) : undefined;
    return { status, ...base, message: refined ?? base.message };
}

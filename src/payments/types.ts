/**
 * The payment contract as the `tempest-fastapi-sdk` backend serialises it.
 *
 * Every shape here is the JSON a service built on that SDK answers with — the
 * Pydantic schemas in `tempest_fastapi_sdk/integrations/payment/base.py`, dumped
 * with `model_dump(mode="json")`. The field names stay in snake_case because
 * `BaseSchema` declares no alias generator, so that is what crosses the wire;
 * renaming them here would make every app write a mapper that can drift.
 *
 * Datetimes arrive as ISO 8601 strings and money as integer cents, never as a
 * float: the backend refuses floats for money on purpose, and so does this side.
 */

/**
 * The canonical state of a charge — `PaymentStatusEnum` in the backend.
 *
 * `"unknown"` is a real state, not a fallback: the backend uses it for a
 * provider state its version does not classify, keeping the provider's own
 * string in `provider_status`. A screen should show it as "we are checking",
 * never as paid or failed.
 */
export type PaymentStatus =
    | "pending"
    | "authorized"
    | "paid"
    | "expired"
    | "cancelled"
    | "refunded"
    | "charged_back"
    | "in_analysis"
    | "failed"
    | "unknown";

/** Who is paying — `PixPayer` in the backend, shared by Pix and card requests. */
export interface PaymentPayer {
    /** Full name. */
    name?: string | null;
    /** CPF or CNPJ, digits or formatted. */
    tax_id?: string | null;
    /** E-mail. Mercado Pago requires it on a card charge (`payer.email`). */
    email?: string | null;
    /** Phone number. */
    phone?: string | null;
}

/** A Pix charge — `PixCharge` in the backend. */
export interface PixCharge {
    /** Provider that owns the charge (`"mercado_pago"`, `"openpix"`, …). */
    provider: string;
    /** The charge's id at the provider. */
    provider_charge_id: string;
    /** The service's own identifier for the charge. */
    reference: string;
    /** Amount in cents. */
    amount_cents: number;
    /** ISO 4217 code; `"BRL"` for Pix. */
    currency: string;
    /** Canonical state — the only field a screen branches on. */
    status: PaymentStatus;
    /** The provider's raw state, for support and logs. */
    provider_status: string;
    /** EMV copia-e-cola string. */
    br_code: string | null;
    /** QR as a Base64 PNG, without the `data:` prefix (Mercado Pago fills it). */
    qr_code_base64: string | null;
    /** QR as a URL (OpenPix fills it instead of the Base64). */
    qr_code_image_url: string | null;
    /** Pix end-to-end id, once the provider reports one. */
    end_to_end_id: string | null;
    /** When the charge stops being payable, ISO 8601. */
    expires_at: string | null;
    /** When it settled, ISO 8601. */
    paid_at: string | null;
    /** The provider's payload as decoded. A screen should not read it. */
    raw?: Record<string, unknown>;
}

/**
 * The body a service needs to charge a tokenized card — `CardChargeRequest` in
 * the backend, minus nothing: `card_token`, `payment_method_id` and
 * `installments` are exactly what {@link useMercadoPagoCard}'s `tokenize`
 * returns, and the card number is never part of it.
 */
export interface CardChargeRequest {
    /** The price in cents. With installments, still the price: the provider adds the interest. */
    amount_cents: number;
    /** The service's own identifier — also the create's idempotency key. */
    reference: string;
    /** Single-use token produced in the browser. */
    card_token: string;
    /** Card brand as the provider names it (`visa`, `master`, …). */
    payment_method_id: string;
    /** Installments the payer chose. Default `1` on the backend. */
    installments?: number;
    /** `false` only authorizes; the charge comes back `authorized`. Default `true`. */
    capture?: boolean;
    /** Free text, where the provider supports it. */
    description?: string | null;
    /** Who is paying. */
    payer?: PaymentPayer | null;
}

/** A card charge — `CardCharge` in the backend. */
export interface CardCharge {
    /** Provider that owns the charge. */
    provider: string;
    /** The charge's id at the provider. */
    provider_charge_id: string;
    /** The service's own identifier. */
    reference: string;
    /** Amount charged, in cents. */
    amount_cents: number;
    /** How much went back to the payer, in cents. A partial refund keeps `status` at `paid`. */
    refunded_cents: number;
    /** ISO 4217 code. */
    currency: string;
    /**
     * Canonical state. A declined card is `"failed"` — returned, not raised: the
     * backend answers the decline as a charge, with the reason in `status_detail`.
     */
    status: PaymentStatus;
    /** The provider's raw state. */
    provider_status: string;
    /** The provider's reason — `rejected_by_issuer`, `waiting_capture`, `accredited`. */
    status_detail: string | null;
    /** Card brand. */
    payment_method_id: string | null;
    /** Installments charged. */
    installments: number | null;
    /** Each installment, interest included, in cents. */
    installment_amount_cents: number | null;
    /** What the payer owes with interest, in cents. Not proof of payment — read `status`. */
    payer_total_cents: number | null;
    /** The provider's payload as decoded. */
    raw?: Record<string, unknown>;
}

const FINAL_STATUSES: ReadonlySet<PaymentStatus> = new Set<PaymentStatus>([
    "paid",
    "expired",
    "cancelled",
    "refunded",
    "charged_back",
    "failed",
]);

/**
 * Whether a checkout has nothing left to wait for.
 *
 * `paid`, `expired`, `cancelled`, `refunded`, `charged_back` and `failed` end the
 * flow the payer is looking at, so a status poll stops there. `pending`,
 * `authorized`, `in_analysis` and `unknown` do not: each is a state the backend
 * will still move. `paid` can later become `refunded`, but that is no longer
 * something the checkout screen waits for.
 *
 * @param status - The charge's canonical state.
 * @returns `true` when following the charge further is pointless.
 *
 * @example
 * if (isFinalPaymentStatus(charge.status)) stopPolling();
 */
export function isFinalPaymentStatus(status: PaymentStatus): boolean {
    return FINAL_STATUSES.has(status);
}

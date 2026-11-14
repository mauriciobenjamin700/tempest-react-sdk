import { useCallback, useEffect, useRef, useState } from "react";

import { useLatestRef } from "@/hooks/use-latest-ref";

import { loadMercadoPago } from "./mercado-pago";
import type {
    MercadoPagoConstructor,
    MercadoPagoFieldOptions,
    MercadoPagoFieldType,
    MercadoPagoLike,
} from "./mercado-pago";

/** Element ids the three Secure Fields mount into. */
export interface MercadoPagoCardContainers {
    cardNumber: string;
    expirationDate: string;
    securityCode: string;
}

/** Options for {@link useMercadoPagoCard}. */
export interface UseMercadoPagoCardOptions {
    /**
     * The application's **Public Key** — never the access token. It is meant to
     * be public: it can only tokenize, and the token is useless without the
     * access token that stays on the backend.
     */
    publicKey: string;
    /** The price in cents, used to quote installments. */
    amountCents: number;
    /** Ids of the empty elements the card number, expiry and CVV iframes mount into. */
    containers: MercadoPagoCardContainers;
    /** MercadoPago.js locale. Default `"pt-BR"`. */
    locale?: string;
    /** Per-field options (placeholder, inline style). */
    fieldOptions?: Partial<Record<MercadoPagoFieldType, MercadoPagoFieldOptions>>;
    /** Loads the constructor. Default {@link loadMercadoPago}; tests pass a fake. */
    load?: () => Promise<MercadoPagoConstructor>;
}

/** One installment choice, in the shape a `<Select>` needs. */
export interface CardInstallmentOption {
    /** Number of installments — the value to submit. */
    installments: number;
    /** The provider's own text, e.g. `"2 parcelas de R$ 54,82 (R$ 109,64)"`. Show it verbatim. */
    recommendedMessage: string;
    /** Each installment, interest included, in cents. */
    installmentAmountCents: number;
    /** What the payer owes in total, interest included, in cents. */
    totalAmountCents: number;
}

/** What the non-card part of the form supplies when tokenizing. */
export interface CardTokenizeInput {
    /** Name printed on the card. */
    cardholderName: string;
    /** Installments chosen from {@link UseMercadoPagoCardResult.installmentOptions}. */
    installments: number;
    /** Document type (`"CPF"`, `"CNPJ"`). */
    identificationType?: string;
    /** Document number, digits only. */
    identificationNumber?: string;
}

/**
 * Everything the backend needs to charge the card — and nothing more.
 *
 * Maps onto the backend's `CardChargeRequest` as `card_token: token` plus the
 * other two fields unchanged. No card number, expiry or CVV: those never left
 * Mercado Pago's iframes.
 */
export interface CardTokenResult {
    /** Single-use card token. */
    token: string;
    /** Card brand as Mercado Pago names it (`visa`, `master`, …). */
    payment_method_id: string;
    /** Installments chosen. */
    installments: number;
}

/** Lifecycle of the Secure Fields. */
export type MercadoPagoCardStatus = "loading" | "ready" | "error";

/** Return value of {@link useMercadoPagoCard}. */
export interface UseMercadoPagoCardResult {
    /** `"ready"` once all three fields are mounted. */
    status: MercadoPagoCardStatus;
    /** Why loading or mounting failed. */
    error: Error | null;
    /** Brand detected from the BIN, or `null` until the payer types enough digits. */
    paymentMethodId: string | null;
    /** Installment choices for the current BIN and amount; empty until known. */
    installmentOptions: CardInstallmentOption[];
    /** `true` while the installments for a new BIN are being fetched. */
    installmentsLoading: boolean;
    /** Why the installment lookup failed, if it did. */
    installmentsError: Error | null;
    /**
     * Ask Mercado Pago for a card token. Throws when the fields are not ready,
     * the BIN has not been identified, or `installments` is not one of the
     * offered options — each of which would otherwise surface later as an
     * opaque `400` from the backend.
     */
    tokenize: (input: CardTokenizeInput) => Promise<CardTokenResult>;
}

const FIELD_TYPES: readonly MercadoPagoFieldType[] = [
    "cardNumber",
    "expirationDate",
    "securityCode",
];

/**
 * The amount as MercadoPago.js wants it: a decimal string, built from integer
 * cents without going through a float.
 */
function centsToDecimal(cents: number): string {
    const whole = Math.trunc(cents / 100);
    const rest = Math.abs(cents % 100);
    return `${whole}.${String(rest).padStart(2, "0")}`;
}

function toCents(amount: number): number {
    return Math.round(amount * 100);
}

/**
 * MercadoPago.js rejects with an array of `{ message }` on a validation error,
 * not an `Error`; normalise so callers can rely on `.message`.
 */
function toError(reason: unknown): Error {
    if (reason instanceof Error) return reason;
    if (Array.isArray(reason)) {
        const parts = reason.map((item: unknown) =>
            typeof item === "object" && item !== null && "message" in item
                ? String(item.message)
                : String(item),
        );
        return new Error(parts.join("; "));
    }
    return new Error(String(reason));
}

function readBin(payload: unknown): string {
    if (typeof payload === "object" && payload !== null && "bin" in payload) {
        const bin = payload.bin;
        return typeof bin === "string" ? bin : "";
    }
    return "";
}

/**
 * Card tokenization with MercadoPago.js **Secure Fields**, plus installments by BIN.
 *
 * The card number, expiry and CVV are typed into iframes served by Mercado Pago,
 * so they never exist in this page's DOM, in React state, in a callback argument
 * or in a log line — not even transiently. That is the property the PCI DSS
 * scoping depends on: a page that renders its own `<input>` for the number and
 * calls `createCardToken` with it has handled cardholder data and is in the
 * heavier SAQ A-EP scope, however quickly it discards the value. The backend
 * never sees the card either: it receives the token, the brand and the
 * installments, which is exactly `CardChargeRequest`.
 *
 * The only digits the hook learns are the BIN (first 6–8), which Mercado Pago's
 * `binChange` event exposes precisely so the page can quote installments; it is
 * used for the lookup and not returned. Installment options come from the
 * provider with its own `recommended_message`, because interest starts at 2x
 * (measured in the sandbox) and the total the payer sees has to be the
 * provider's number, not one recomputed here.
 *
 * The containers must be in the DOM when the hook's effect runs — render the
 * three empty elements in the same component. The fields are created once per
 * `publicKey`; changing the containers, locale or loader afterwards does not
 * remount them.
 *
 * @tempest-limits empty-catch — `unmount()` throws when MercadoPago.js already
 * tore the iframe down (a container removed by React first). The cleanup has
 * nothing left to undo in that case and nowhere useful to report it.
 *
 * @param options - Public key, amount, container ids and an injectable loader.
 * @returns Field status, brand, installment options and `tokenize`.
 *
 * @example
 * const card = useMercadoPagoCard({
 *   publicKey: import.meta.env.VITE_MP_PUBLIC_KEY,
 *   amountCents: 10964,
 *   containers: { cardNumber: "mp-number", expirationDate: "mp-expiry", securityCode: "mp-cvv" },
 * });
 * const { token, payment_method_id, installments } = await card.tokenize({
 *   cardholderName: "APRO",
 *   installments: 1,
 *   identificationType: "CPF",
 *   identificationNumber: "12345678909",
 * });
 */
export function useMercadoPagoCard(options: UseMercadoPagoCardOptions): UseMercadoPagoCardResult {
    const {
        publicKey,
        amountCents,
        containers,
        locale = "pt-BR",
        fieldOptions,
        load = loadMercadoPago,
    } = options;
    const [status, setStatus] = useState<MercadoPagoCardStatus>("loading");
    const [error, setError] = useState<Error | null>(null);
    const [bin, setBin] = useState("");
    const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
    const [installmentOptions, setInstallmentOptions] = useState<CardInstallmentOption[]>([]);
    const [installmentsLoading, setInstallmentsLoading] = useState(false);
    const [installmentsError, setInstallmentsError] = useState<Error | null>(null);
    const mpRef = useRef<MercadoPagoLike | null>(null);
    const setupRef = useLatestRef({ containers, locale, fieldOptions, load });

    useEffect(() => {
        let cancelled = false;
        const mounted: { unmount(): unknown }[] = [];
        setStatus("loading");
        setError(null);
        const setup = setupRef.current;
        setup
            .load()
            .then((MercadoPago) => {
                if (cancelled) return;
                const mp = new MercadoPago(publicKey, { locale: setup.locale });
                for (const type of FIELD_TYPES) {
                    const field = mp.fields.create(type, setup.fieldOptions?.[type]);
                    field.mount(setup.containers[type]);
                    mounted.push(field);
                    if (type === "cardNumber")
                        field.on("binChange", (payload) => setBin(readBin(payload)));
                }
                mpRef.current = mp;
                setStatus("ready");
            })
            .catch((reason: unknown) => {
                if (cancelled) return;
                setError(toError(reason));
                setStatus("error");
            });
        return () => {
            cancelled = true;
            mpRef.current = null;
            for (const field of mounted) {
                try {
                    field.unmount();
                } catch {
                    /* empty */
                }
            }
        };
    }, [publicKey, setupRef]);

    useEffect(() => {
        const mp = mpRef.current;
        setPaymentMethodId(null);
        setInstallmentOptions([]);
        setInstallmentsError(null);
        if (mp === null || bin.length < 6 || status !== "ready") {
            setInstallmentsLoading(false);
            return;
        }
        let stale = false;
        setInstallmentsLoading(true);
        mp.getInstallments({ amount: centsToDecimal(amountCents), bin })
            .then((entries) => {
                if (stale) return;
                const entry = entries[0];
                if (entry === undefined)
                    throw new Error("Mercado Pago returned no installments for this card.");
                setPaymentMethodId(entry.payment_method_id);
                setInstallmentOptions(
                    entry.payer_costs.map((cost) => ({
                        installments: Number(cost.installments),
                        recommendedMessage: cost.recommended_message,
                        installmentAmountCents: toCents(cost.installment_amount),
                        totalAmountCents: toCents(cost.total_amount),
                    })),
                );
            })
            .catch((reason: unknown) => {
                if (!stale) setInstallmentsError(toError(reason));
            })
            .finally(() => {
                if (!stale) setInstallmentsLoading(false);
            });
        return () => {
            stale = true;
        };
    }, [bin, amountCents, status]);

    const tokenize = useCallback(
        async (input: CardTokenizeInput): Promise<CardTokenResult> => {
            const mp = mpRef.current;
            if (mp === null || status !== "ready")
                throw new Error("The card fields are not ready yet.");
            if (paymentMethodId === null)
                throw new Error("The card brand has not been identified yet.");
            if (!installmentOptions.some((option) => option.installments === input.installments)) {
                throw new Error(
                    `${input.installments} installments is not an option for this card and amount.`,
                );
            }
            const data: {
                cardholderName: string;
                identificationType?: string;
                identificationNumber?: string;
            } = {
                cardholderName: input.cardholderName,
            };
            if (input.identificationType !== undefined)
                data.identificationType = input.identificationType;
            if (input.identificationNumber !== undefined)
                data.identificationNumber = input.identificationNumber;
            const token = await mp.fields.createCardToken(data).catch((reason: unknown) => {
                throw toError(reason);
            });
            return {
                token: token.id,
                payment_method_id: paymentMethodId,
                installments: input.installments,
            };
        },
        [status, paymentMethodId, installmentOptions],
    );

    return {
        status,
        error,
        paymentMethodId,
        installmentOptions,
        installmentsLoading,
        installmentsError,
        tokenize,
    };
}

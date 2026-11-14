/**
 * @tempest-limits props-count — `charge` is the data, `qrSize` the symbol,
 * `labels`/`formatRemaining` the copy an app translates, and `onCopied` the one
 * intent the screen emits.
 */
import type { HTMLAttributes, ReactNode } from "react";

import { Alert } from "@/components/Alert";
import type { AlertVariant } from "@/components/Alert";
import { CopyButton } from "@/components/CopyButton";
import { Money } from "@/components/Money";
import { QRCode } from "@/components/QRCode";
import { useCountdown } from "@/hooks/use-countdown";
import { cn } from "@/utils/cn";

import { formatPixRemaining } from "./format";
import type { PaymentStatus, PixCharge } from "./types";
import styles from "./PixCheckout.module.css";

/** Strings the screen renders, so an app can translate them. */
export interface PixCheckoutLabels {
    /** Accessible name of the QR. */
    qr: string;
    /** Heading over the copia-e-cola line. */
    copyHint: string;
    /** Copy button, idle. */
    copy: string;
    /** Copy button, just clicked. */
    copied: string;
    /** Prefix of the countdown, e.g. "Expira em". */
    expiresIn: string;
    /** Shown when the deadline passed but the backend has not said "expired" yet. */
    confirming: string;
    /** Title and description per terminal or waiting state. */
    states: Record<PaymentStatus, { title: string; description: string }>;
}

const DEFAULT_LABELS: PixCheckoutLabels = {
    qr: "QR code do Pix",
    copyHint: "Ou copie o código Pix e cole no app do seu banco",
    copy: "Copiar código",
    copied: "Copiado",
    expiresIn: "Expira em",
    confirming: "O prazo acabou. Estamos confirmando com o banco se o pagamento chegou.",
    states: {
        pending: {
            title: "Aguardando pagamento",
            description: "Abra o app do seu banco, escolha Pix e escaneie o QR code.",
        },
        authorized: {
            title: "Pagamento autorizado",
            description: "Estamos concluindo o pagamento.",
        },
        in_analysis: {
            title: "Pagamento em análise",
            description: "Avisaremos assim que for concluído.",
        },
        paid: { title: "Pagamento confirmado", description: "Recebemos o seu Pix. Obrigado!" },
        expired: {
            title: "Pix expirado",
            description: "O prazo para pagar acabou. Gere um novo Pix.",
        },
        cancelled: {
            title: "Pix cancelado",
            description: "Esta cobrança foi cancelada e não pode mais ser paga.",
        },
        refunded: {
            title: "Pix devolvido",
            description: "O valor foi devolvido para a sua conta.",
        },
        charged_back: {
            title: "Pix contestado",
            description: "O pagamento foi contestado junto ao banco.",
        },
        failed: {
            title: "Pix não concluído",
            description: "Não foi possível concluir o pagamento. Gere um novo Pix.",
        },
        unknown: {
            title: "Verificando o pagamento",
            description: "Ainda estamos confirmando este Pix.",
        },
    },
};

const STATE_VARIANT: Record<PaymentStatus, AlertVariant> = {
    pending: "info",
    authorized: "info",
    in_analysis: "info",
    paid: "success",
    expired: "warning",
    cancelled: "neutral",
    refunded: "neutral",
    charged_back: "warning",
    failed: "danger",
    unknown: "neutral",
};

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const PNG_PREFIX = "data:image/png;base64,";

/**
 * The QR image source, or `null` to draw it locally.
 *
 * Only a well-formed Base64 payload becomes a `data:image/png` URL: the field
 * arrives from the network, and an image `src` built from an unchecked string
 * is a place where something other than a PNG can end up. A value that already
 * carries the `data:image/png;base64,` prefix is accepted once.
 */
function qrImageSource(base64: string | null): string | null {
    if (base64 === null) return null;
    const body = base64.startsWith(PNG_PREFIX) ? base64.slice(PNG_PREFIX.length) : base64;
    const compact = body.replace(/\s+/g, "");
    return compact.length > 0 && compact.length % 4 === 0 && BASE64.test(compact)
        ? PNG_PREFIX + compact
        : null;
}

export interface PixCheckoutProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /** The charge as the backend reports it — pair with {@link usePixCharge} to follow it. */
    charge: PixCharge;
    /** Rendered side of the QR in px. Default `220`. */
    qrSize?: number;
    labels?: Partial<Omit<PixCheckoutLabels, "states">> & {
        states?: Partial<PixCheckoutLabels["states"]>;
    };
    /** Formats the countdown. Default {@link formatPixRemaining}. */
    formatRemaining?: (ms: number) => string;
    /** Called after the copia-e-cola reaches the clipboard. */
    onCopied?: () => void;
    /** Rendered under the status, e.g. a "gerar novo Pix" button for a final state. */
    footer?: ReactNode;
}

/**
 * The payer's Pix screen: amount, QR, copia-e-cola, countdown and the state the
 * backend reports.
 *
 * Presentational and controlled. It renders `charge` and never changes it, so
 * the decision that a Pix was paid stays where it can be made — on the backend,
 * re-reading the order. Feed it from {@link usePixCharge} or from your own
 * stream.
 *
 * The QR comes from `qr_code_base64` when the provider sent one (Mercado Pago),
 * and is otherwise drawn locally from `br_code` (OpenPix sends a URL instead,
 * and fetching it would hand the payload to an image host for nothing). The
 * copia-e-cola line is always next to it: a QR cannot be scanned by the phone
 * that is showing it, which is where a mobile checkout puts it.
 *
 * When the countdown reaches zero while the backend still says `pending`, the
 * screen hides the QR and says it is **confirming** — not "expired". A payment
 * sent in the last second can still settle, and only the backend knows.
 *
 * @example
 * const { charge } = usePixCharge(created, { refresh: (signal) => readCharge(created.provider_charge_id, signal) });
 * <PixCheckout charge={charge} />
 */
export function PixCheckout({
    charge,
    qrSize = 220,
    labels,
    formatRemaining = formatPixRemaining,
    onCopied,
    footer,
    className,
    ...rest
}: PixCheckoutProps) {
    const text: PixCheckoutLabels = {
        ...DEFAULT_LABELS,
        ...labels,
        states: { ...DEFAULT_LABELS.states, ...labels?.states },
    };
    const expiresAt = charge.expires_at === null ? Number.NaN : Date.parse(charge.expires_at);
    const hasDeadline = Number.isFinite(expiresAt);
    const remaining = useCountdown(hasDeadline ? expiresAt : 0, 0);
    const status: PaymentStatus = charge.status in STATE_VARIANT ? charge.status : "unknown";
    const pastDeadline = hasDeadline && remaining <= 0;
    const payable = status === "pending" && !pastDeadline && charge.br_code !== null;
    const image = qrImageSource(charge.qr_code_base64);
    const state = text.states[status];

    return (
        <div className={cn(styles.checkout, className)} data-status={status} {...rest}>
            <Money
                className={styles.amount}
                cents={charge.amount_cents}
                currency={charge.currency}
            />
            {status === "pending" ? (
                <div role="status" className={styles.state}>
                    <p className={styles.title}>{state.title}</p>
                    <p className={styles.description}>
                        {pastDeadline ? text.confirming : state.description}
                    </p>
                </div>
            ) : (
                <Alert
                    className={styles.state}
                    variant={STATE_VARIANT[status]}
                    title={state.title}
                    description={state.description}
                />
            )}
            {payable && hasDeadline && (
                <p className={styles.timer} role="timer" aria-live="off">
                    {text.expiresIn} <strong>{formatRemaining(remaining)}</strong>
                </p>
            )}
            {payable && charge.br_code !== null && (
                <>
                    <div className={styles.symbol}>
                        {image !== null ? (
                            <img
                                src={image}
                                alt={text.qr}
                                width={qrSize}
                                height={qrSize}
                                className={styles.image}
                            />
                        ) : (
                            <QRCode
                                value={charge.br_code}
                                size={qrSize}
                                label={text.qr}
                                margin={2}
                            />
                        )}
                    </div>
                    <p className={styles.hint}>{text.copyHint}</p>
                    <div className={styles.copy}>
                        <code className={styles.code} data-testid="pix-checkout-code">
                            {charge.br_code}
                        </code>
                        <CopyButton value={charge.br_code} onCopied={onCopied}>
                            <span className={styles.copyIdle}>{text.copy}</span>
                            <span className={styles.copyDone}>{text.copied}</span>
                        </CopyButton>
                    </div>
                </>
            )}
            {footer !== undefined && <div className={styles.footer}>{footer}</div>}
        </div>
    );
}

/**
 * @tempest-limits props-count — `pix` and `payload` are the two ways to supply the
 * same code (build it, or bring one already built), `size`/`level` are the symbol,
 * and amountLabel/payeeLabel/labels exist so the surrounding copy can be translated
 * without wrapping the component.
 */
import type { HTMLAttributes } from "react";
import { useMemo } from "react";

import { CopyButton } from "@/components/CopyButton";
import { QRCode } from "@/components/QRCode";
import type { QRErrorCorrection } from "@/components/QRCode";
import { cn } from "@/utils/cn";

import { PixError, pixPayload } from "./pix";
import type { PixInput } from "./pix";
import styles from "./PixQRCode.module.css";

/** Strings the component renders, so an app can translate them. */
export interface PixQRCodeLabels {
    /** Accessible name of the symbol. */
    qr: string;
    /** Copy button, idle. */
    copy: string;
    /** Copy button, just clicked. */
    copied: string;
}

const DEFAULT_LABELS: PixQRCodeLabels = {
    qr: "QR code do Pix",
    copy: "Copiar código",
    copied: "Copiado",
};

export interface PixQRCodeProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /**
     * Build the payload from its parts. Mutually exclusive with {@link payload}.
     */
    pix?: PixInput;
    /**
     * A payload your PSP already produced, used verbatim.
     *
     * Prefer this for a dynamic charge: the PSP signed that string, and rebuilding
     * it here from parsed parts would only add a way to get it wrong.
     */
    payload?: string;
    /** Rendered side of the symbol in px, quiet zone included. Default `192`. */
    size?: number;
    /**
     * Error-correction level. Default `"M"`.
     *
     * A printed QR that will be photographed at an angle scans better at `"Q"` or
     * `"H"`; the cost is a denser symbol, so raise the size with it.
     */
    level?: QRErrorCorrection;
    /** Render the copia-e-cola line and its copy button. Default `true`. */
    showCopy?: boolean;
    /** Amount caption, e.g. `"R$ 25,50"`. Rendered above the symbol when set. */
    amountLabel?: string;
    /** Payee caption. Rendered under the amount when set. */
    payeeLabel?: string;
    labels?: Partial<PixQRCodeLabels>;
    /** Called after the payload reaches the clipboard. */
    onCopied?: () => void;
}

/**
 * A Pix QR code with the copia-e-cola string next to it.
 *
 * The two affordances belong together: a QR is unusable on the device that is
 * *showing* it, which is exactly where a mobile checkout puts it, so every real
 * Pix screen ends up needing the copyable string as well. Rendering only the
 * symbol is the single most common mistake in a Pix flow.
 *
 * Everything is computed locally — {@link pixPayload} builds the string and the
 * SDK's own encoder draws the symbol — so the key, the amount and the txid never
 * leave the page. A QR-image service would receive all three.
 *
 * @throws {PixError} When neither `pix` nor `payload` is given, when both are, or
 * when `pix` fails validation. A bad key is a programming or data error rather
 * than a state to render, so it surfaces; wrap the screen in `ErrorBoundary` when
 * the values come from user input.
 *
 * @example
 * <PixQRCode
 *   pix={{
 *     key: "loja@tempest.dev",
 *     merchantName: "Loja Tempest",
 *     merchantCity: "São Paulo",
 *     amount: 25.5,
 *     txid: "PEDIDO123",
 *   }}
 *   amountLabel="R$ 25,50"
 *   payeeLabel="Loja Tempest"
 * />
 *
 * @example
 * <PixQRCode payload={charge.brcode} level="Q" size={220} />
 */
export function PixQRCode({
    pix,
    payload,
    size = 192,
    level = "M",
    showCopy = true,
    amountLabel,
    payeeLabel,
    labels,
    onCopied,
    className,
    ...rest
}: PixQRCodeProps) {
    const value = useMemo(() => {
        if (payload !== undefined && pix !== undefined) {
            throw new PixError("Pass either `pix` or `payload` to PixQRCode, not both.");
        }
        if (payload !== undefined) return payload.trim();
        if (pix !== undefined) return pixPayload(pix);
        throw new PixError("PixQRCode needs either `pix` or `payload`.");
    }, [pix, payload]);

    const text = { ...DEFAULT_LABELS, ...labels };

    return (
        <div className={cn(styles.pix, className)} {...rest}>
            {amountLabel !== undefined && <span className={styles.amount}>{amountLabel}</span>}
            {payeeLabel !== undefined && <span className={styles.payee}>{payeeLabel}</span>}
            <div className={styles.symbol}>
                <QRCode value={value} size={size} level={level} label={text.qr} margin={2} />
            </div>
            {showCopy && (
                <div className={styles.copy}>
                    <code className={styles.payload} data-testid="pix-payload">
                        {value}
                    </code>
                    <CopyButton value={value} onCopied={onCopied}>
                        <span className={styles.copyIdle}>{text.copy}</span>
                        <span className={styles.copyDone}>{text.copied}</span>
                    </CopyButton>
                </div>
            )}
        </div>
    );
}

/**
 * @tempest-limits file-lines, props-count, function-lines — the scan loop is tuned
 * by the caller because the right values depend on the symbology and the device:
 * formats, intervalMs, repeatDelayMs, detector, paused, torch, aspectRatio. The rest
 * are the surfaces to fill when the API is missing (unsupported, footer, locale) and
 * the two outputs (onScan, onError).
 */
import { Flashlight, FlashlightOff, ScanLine } from "lucide-react";
import { type HTMLAttributes, type ReactNode } from "react";

import { useBarcodeScanner } from "@/capture/use-barcode-scanner";
import type { BarcodeDetectorLike, BarcodeFormat, BarcodeScanResult } from "@/capture/barcode";
import { cn } from "@/utils/cn";

import styles from "./BarcodeScanner.module.css";

/** DOM attributes this component redefines. */
type OverriddenDomProps = "children" | "onError";

export interface BarcodeScannerProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    OverriddenDomProps
> {
    /** Called for every accepted read — repeats of the same value are suppressed. */
    onScan: (result: BarcodeScanResult) => void;
    /** Symbologies to look for. Defaults to QR + EAN-13 + Code 128. */
    formats?: readonly BarcodeFormat[];
    /** Stop looking without releasing the camera — set it while a confirmation is open. */
    paused?: boolean;
    /** A decoder to use instead of the native one, for Safari and Firefox. */
    detector?: BarcodeDetectorLike;
    /** How often a frame is examined, in ms. Default 200. */
    intervalMs?: number;
    /** Ignore the same value again for this long, in ms. Default 2500. */
    repeatDelayMs?: number;
    /** Offer the torch toggle when the camera has a lamp. Default `true`. */
    torch?: boolean;
    /** Viewport aspect ratio, `width / height`. Default `4 / 3`. */
    aspectRatio?: number;
    /** Locale for the labels. Default `"pt-BR"`. */
    locale?: "pt-BR" | "en";
    /** Under the viewport — an instruction, the code just read, a manual-entry link. */
    footer?: ReactNode;
    /**
     * Rendered instead of the camera when there is no decoder.
     *
     * Worth filling in: on iOS and Firefox this is the **only** thing the user sees, so
     * the fallback is usually a plain text field for typing the code.
     */
    unsupported?: ReactNode;
    /** A frame the engine refused to decode. Routine and usually transient. */
    onError?: (error: unknown) => void;
}

const STRINGS = {
    "pt-BR": {
        viewport: "Visor da câmera",
        scanning: "Procurando código…",
        paused: "Leitura pausada",
        opening: "Abrindo a câmera…",
        hint: "Aponte a câmera para o código.",
        found: (value: string) => `Código lido: ${value}`,
        torchOn: "Desligar lanterna",
        torchOff: "Ligar lanterna",
        unsupported: "Este navegador não decodifica códigos de barras.",
        retry: "Tentar de novo",
    },
    en: {
        viewport: "Camera viewport",
        scanning: "Looking for a code…",
        paused: "Scanning paused",
        opening: "Opening the camera…",
        hint: "Point the camera at the code.",
        found: (value: string) => `Code read: ${value}`,
        torchOn: "Turn torch off",
        torchOff: "Turn torch on",
        unsupported: "This browser cannot decode barcodes.",
        retry: "Try again",
    },
} as const;

/**
 * Point the camera at a barcode and get its value.
 *
 * The counterpart to {@link QRCode}, which only encodes. Under it are
 * `useBarcodeScanner` (the detect loop and repeat suppression), `useCameraStream` (the
 * stream and its classified errors) and `useTorch`.
 *
 * **Mounting this opens the camera**, so mount it when the user asks to scan rather
 * than on a page that happens to contain a scanner: a permission prompt nobody
 * provoked is the surest way to earn a permanent block, and after that `getUserMedia`
 * rejects without ever prompting again. The usual shape is a button that reveals it.
 *
 * The `unsupported` slot is not a nicety. `BarcodeDetector` is Chromium-only — absent
 * on Firefox, on every browser on iOS, and on Chromium for Windows and Linux — so on a
 * large share of real devices the fallback *is* the feature. Give it a text field, or
 * inject a polyfill through `detector`.
 *
 * The preview itself is `aria-hidden`: a live camera frame has nothing to announce and
 * no audio to caption, so what a screen reader gets is the `role="status"` line, which
 * says whether scanning is running and reads out each accepted code.
 *
 * @example
 * <BarcodeScanner
 *     formats={["ean_13"]}
 *     onScan={({ rawValue }) => addToCart(rawValue)}
 *     footer={<small>Aponte para o código de barras da embalagem.</small>}
 *     unsupported={<ManualCodeInput onSubmit={addToCart} />}
 * />
 */
export function BarcodeScanner({
    onScan,
    formats,
    paused = false,
    detector,
    intervalMs,
    repeatDelayMs,
    torch = true,
    aspectRatio = 4 / 3,
    locale = "pt-BR",
    footer,
    unsupported,
    onError,
    className,
    ...rest
}: BarcodeScannerProps) {
    const strings = STRINGS[locale];
    const {
        videoRef,
        status,
        error,
        supported,
        scanning,
        result,
        torch: lamp,
        retry,
    } = useBarcodeScanner({
        formats,
        paused,
        detector,
        intervalMs,
        repeatDelayMs,
        onScan,
        onError,
    });

    if (!supported) {
        return (
            <div className={cn(styles.scanner, className)} {...rest}>
                <p className={styles.notice}>{strings.unsupported}</p>
                {unsupported}
            </div>
        );
    }

    const message = result
        ? strings.found(result.rawValue)
        : paused
          ? strings.paused
          : scanning
            ? strings.scanning
            : strings.opening;

    return (
        <div className={cn(styles.scanner, className)} {...rest}>
            <div
                className={styles.viewport}
                style={{ aspectRatio: String(aspectRatio) }}
                aria-label={strings.viewport}
                role="group"
            >
                <video
                    ref={videoRef}
                    className={styles.video}
                    muted
                    playsInline
                    aria-hidden="true"
                />

                {status === "ready" && (
                    <div className={styles.frame} aria-hidden="true">
                        <span className={cn(styles.laser, scanning && styles.laserActive)} />
                    </div>
                )}

                {torch && lamp.supported && (
                    <button
                        type="button"
                        className={styles.torch}
                        onClick={() => void lamp.toggle()}
                        aria-pressed={lamp.on}
                        aria-label={lamp.on ? strings.torchOn : strings.torchOff}
                    >
                        {lamp.on ? (
                            <FlashlightOff size={18} aria-hidden />
                        ) : (
                            <Flashlight size={18} aria-hidden />
                        )}
                    </button>
                )}

                {error && (
                    <div className={styles.overlay} role="alert">
                        <p className={styles.overlayText}>{error.message}</p>
                        <button type="button" className={styles.retry} onClick={retry}>
                            {strings.retry}
                        </button>
                    </div>
                )}
            </div>

            {!error && (
                <p className={styles.status} role="status">
                    <ScanLine size={14} aria-hidden className={styles.statusIcon} />
                    {message}
                </p>
            )}

            {footer ? <div className={styles.footer}>{footer}</div> : null}
        </div>
    );
}

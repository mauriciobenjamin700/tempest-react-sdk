import { useMemo } from "react";
import type { HTMLAttributes } from "react";

import { cn } from "@/utils/cn";

import { encodeQR, matrixToPath } from "./qr-encode";
import type { QRErrorCorrection } from "./qr-encode";
import styles from "./QRCode.module.css";

export interface QRCodeProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /** The payload. Encoded as UTF-8 when it is not plain digits or upper-case text. */
    value: string;
    /** Rendered side in px, quiet zone included. Default `160`. */
    size?: number;
    /** Error correction level. Default `"M"`. */
    level?: QRErrorCorrection;
    /** Quiet zone in modules. The standard asks for 4; below that, scanners start to miss. */
    margin?: number;
    /** Module colour. Defaults to black — see the note on dark mode below. */
    color?: string;
    /** Background colour. Defaults to white. */
    background?: string;
    /**
     * Accessible name. Defaults to naming the payload, because a screen reader
     * user cannot scan the symbol: the content has to reach them as text.
     */
    label?: string;
}

/**
 * A QR symbol, encoded in the browser and drawn as SVG.
 *
 * No dependency and no network round trip: an image service would leak the
 * payload — a payment link, a session token, an invite — to a third party, and
 * the encoder is a few kilobytes.
 *
 * SVG rather than canvas so the symbol stays sharp at any size and prints at
 * the printer's resolution instead of the screen's. Everything is one path
 * (horizontal runs merged), because a version-10 symbol is 3 481 modules and
 * that many elements costs real paint time.
 *
 * The colours are **black on white in both themes, on purpose** — they are the
 * one part of the SDK that ignores the theme tokens. Scanners expect
 * dark-on-light, and the ones that cope with an inverted symbol do it slowly and
 * unreliably; a QR that looks integrated with a dark page and scans on the third
 * try is worse than one that looks pasted on. Wiring the modules to
 * `--tempest-text` would flip them light in dark mode and leave a light symbol
 * on the white background, which scans as nothing at all. Override
 * `color`/`background` only with a scanner in hand.
 *
 * @throws {QRCapacityError} When the payload is too long for a version-40
 * symbol at the chosen level. That is a programming error rather than a state
 * to render, so it surfaces instead of silently drawing nothing — wrap it in
 * `ErrorBoundary` if the payload comes from user input.
 *
 * @example
 * <QRCode value="https://tempest.dev" />
 * <QRCode value={pixPayload} level="H" size={220} label="QR do Pix" />
 */
export function QRCode({
    value,
    size = 160,
    level = "M",
    margin = 4,
    color = "#000000",
    background = "#ffffff",
    label,
    className,
    style,
    ...rest
}: QRCodeProps) {
    const { path, side } = useMemo(() => {
        const matrix = encodeQR(value, { level });
        return {
            path: matrixToPath(matrix, margin),
            side: matrix.size + margin * 2,
        };
    }, [value, level, margin]);

    return (
        <div
            className={cn(styles.wrapper, className)}
            style={{ width: size, height: size, ...style }}
            {...rest}
        >
            <svg
                className={styles.svg}
                viewBox={`0 0 ${side} ${side}`}
                width={size}
                height={size}
                role="img"
                aria-label={label ?? `QR code: ${value}`}
                shapeRendering="crispEdges"
            >
                <rect width={side} height={side} fill={background} />
                <path d={path} fill={color} />
            </svg>
        </div>
    );
}

import { useEffect, useRef, useState, type RefObject } from "react";

import { useStableCallback } from "@/hooks/use-stable-callback";
import {
    useCameraStream,
    type CameraStreamError,
    type CameraStreamStatus,
} from "@/vision/use-camera-stream";

import {
    createBarcodeDetector,
    getSupportedBarcodeFormats,
    isBarcodeDetectionSupported,
    normalizeBarcode,
    DEFAULT_BARCODE_FORMATS,
    type BarcodeDetectorLike,
    type BarcodeFormat,
    type BarcodeScanResult,
} from "./barcode";
import { useTorch, type UseTorchResult } from "./use-torch";

/** Options for {@link useBarcodeScanner}. */
export interface UseBarcodeScannerOptions {
    /** Symbologies to look for. Defaults to {@link DEFAULT_BARCODE_FORMATS}. */
    formats?: readonly BarcodeFormat[];
    /** Called for every accepted read — that is, after repeat suppression. */
    onScan?: (result: BarcodeScanResult) => void;
    /**
     * How often a frame is examined, in ms. Default 200.
     *
     * Not `requestAnimationFrame`: decoding is 10–40 ms of main-thread work on a
     * phone, so running it per frame competes with the preview it is reading from and
     * makes the video stutter. Five looks per second is faster than a human can aim.
     */
    intervalMs?: number;
    /**
     * Ignore the **same** value again for this long, in ms. Default 2500.
     *
     * A symbol stays in frame for as long as the user holds the camera there, so a
     * scanner without this fires the same code five times a second — which, wired to
     * "add item to cart", is a bug the user pays for. A *different* value is never
     * suppressed.
     */
    repeatDelayMs?: number;
    /** Stop looking without releasing the camera — a confirmation sheet is open. */
    paused?: boolean;
    /**
     * A decoder to use instead of the native one.
     *
     * The way to support Safari and Firefox: hand in a polyfill and everything else
     * here works unchanged. See {@link isBarcodeDetectionSupported} for why the SDK
     * does not bundle one.
     */
    detector?: BarcodeDetectorLike;
    /** Camera constraints, forwarded to `useCameraStream`. Defaults to the rear camera. */
    constraints?: MediaStreamConstraints;
    /**
     * A frame the engine refused to decode.
     *
     * Not "nothing found" — that resolves to an empty list and is the normal case.
     * This is the engine itself failing, which the loop survives because it is
     * usually transient (a frame arriving between two resolutions).
     */
    onError?: (error: unknown) => void;
}

/** Value returned by {@link useBarcodeScanner}. */
export interface UseBarcodeScannerResult {
    /** Attach to a `<video ref={…} muted playsInline />`. */
    videoRef: RefObject<HTMLVideoElement | null>;
    /** Camera lifecycle. `"ready"` means the preview is running. */
    status: CameraStreamStatus;
    /** Classified camera error, or `null`. */
    error: CameraStreamError | null;
    /** `false` when there is no decoder — no native API and none injected. */
    supported: boolean;
    /**
     * Formats actually in use: the requested ones intersected with what the engine
     * reports. Empty while the probe is in flight, or when nothing matched.
     */
    formats: readonly BarcodeFormat[];
    /** Whether the detect loop is running right now. */
    scanning: boolean;
    /** The most recent accepted read, or `null`. */
    result: BarcodeScanResult | null;
    /** The LED torch of this camera, when it has one. */
    torch: UseTorchResult;
    /** Re-open the camera after an error (the user changed the permission). */
    retry: () => void;
}

/** A video is decodable once it has data for the current frame and a real size. */
function frameIsReady(video: HTMLVideoElement): boolean {
    return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
}

/**
 * Read barcodes and QR codes from the camera.
 *
 * The camera and its classified errors come from `useCameraStream`, so this hook is
 * only the decoding half: it drives a `BarcodeDetector` over the preview on an
 * interval, suppresses the same value repeating, and exposes the torch.
 *
 * **Mounting this opens the camera.** It inherits that from `useCameraStream`, which
 * acquires on mount — so mount it *after* the user asks to scan (a button that reveals
 * the scanner), never on a page that merely contains one. A permission prompt nobody
 * provoked is the most reliable way to earn a permanent block, after which
 * `getUserMedia` rejects without ever prompting again.
 *
 * `supported` deserves a branch in the UI, not an assertion: `BarcodeDetector` is
 * Chromium-only and missing on Windows/Linux desktop, Firefox and everything on iOS.
 * Inject a `detector` to cover those, or tell the user to type the code.
 *
 * @param options - See {@link UseBarcodeScannerOptions}.
 * @returns The camera plumbing plus the scan state.
 *
 * @example
 * const scanner = useBarcodeScanner({
 *     formats: ["ean_13"],
 *     onScan: ({ rawValue }) => addToCart(rawValue),
 * });
 * return <video ref={scanner.videoRef} muted playsInline />;
 */
export function useBarcodeScanner(options: UseBarcodeScannerOptions = {}): UseBarcodeScannerResult {
    const {
        formats: requested = DEFAULT_BARCODE_FORMATS,
        onScan,
        intervalMs = 200,
        repeatDelayMs = 2500,
        paused = false,
        detector: injected,
        constraints,
        onError,
    } = options;

    const [supported, setSupported] = useState(
        () => injected !== undefined || isBarcodeDetectionSupported(),
    );

    /**
     * No decoder, no camera.
     *
     * Opening the camera only to report "this browser cannot decode barcodes" spends a
     * permission prompt on nothing — and a refusal is permanent, so it also spends the
     * *next* feature that needs the camera.
     */
    const camera = useCameraStream({ constraints, enabled: supported });
    const torch = useTorch(camera.stream);

    const [formats, setFormats] = useState<readonly BarcodeFormat[]>(
        injected !== undefined ? requested : [],
    );
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState<BarcodeScanResult | null>(null);

    const detectorRef = useRef<BarcodeDetectorLike | null>(null);
    const lastValue = useRef<string | null>(null);
    const lastAt = useRef(0);

    const emitScan = useStableCallback((scan: BarcodeScanResult) => onScan?.(scan));
    const emitError = useStableCallback((error: unknown) => onError?.(error));

    const requestedKey = requested.join(",");

    /**
     * Resolve which formats the engine will take, then build the detector.
     *
     * The intersection is not defensive coding: `new BarcodeDetector({ formats })`
     * throws `NotSupportedError` when any entry is unknown to the platform decoder, and
     * that list differs between two Chromium builds on two operating systems. Asking
     * for the intersection is the only way one call site works everywhere.
     */
    useEffect(() => {
        if (injected) {
            detectorRef.current = injected;
            setSupported(true);
            setFormats(requested);
            return;
        }
        if (!isBarcodeDetectionSupported()) {
            detectorRef.current = null;
            setSupported(false);
            setFormats([]);
            return;
        }
        let cancelled = false;
        void getSupportedBarcodeFormats().then((available) => {
            if (cancelled) return;
            const usable =
                available.length === 0
                    ? requested
                    : requested.filter((format) => available.includes(format));
            const detector = usable.length > 0 ? createBarcodeDetector(usable) : null;
            detectorRef.current = detector;
            setFormats(detector ? usable : []);
            setSupported(detector !== null);
        });
        return () => {
            cancelled = true;
        };
        // `requestedKey` stands in for the array identity, so a caller passing an
        // inline `formats={["ean_13"]}` does not rebuild the detector every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [injected, requestedKey]);

    /**
     * Look at a frame every `intervalMs`, and never overlap two looks.
     *
     * The loop re-arms itself *after* each `detect()` settles rather than running on a
     * fixed `setInterval`: decoding sometimes takes longer than the interval, and an
     * interval would then queue calls faster than the engine drains them until the tab
     * is unusable.
     */
    useEffect(() => {
        if (!supported || paused || camera.status !== "ready") {
            setScanning(false);
            return;
        }
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        setScanning(true);

        const accept = (scan: BarcodeScanResult): void => {
            const now = Date.now();
            const isRepeat =
                scan.rawValue === lastValue.current && now - lastAt.current < repeatDelayMs;
            if (isRepeat) return;
            lastValue.current = scan.rawValue;
            lastAt.current = now;
            setResult(scan);
            emitScan(scan);
        };

        const look = async (): Promise<void> => {
            const video = camera.videoRef.current;
            const detector = detectorRef.current;
            if (!video || !detector || !frameIsReady(video)) return;
            try {
                const found = await detector.detect(video);
                if (stopped) return;
                for (const raw of found) {
                    const scan = normalizeBarcode(raw);
                    if (scan.rawValue !== "") accept(scan);
                }
            } catch (error) {
                if (!stopped) emitError(error);
            }
        };

        const tick = (): void => {
            void look().finally(() => {
                if (!stopped) timer = setTimeout(tick, intervalMs);
            });
        };
        tick();

        return () => {
            stopped = true;
            if (timer !== undefined) clearTimeout(timer);
            setScanning(false);
        };
    }, [
        supported,
        paused,
        camera.status,
        camera.videoRef,
        intervalMs,
        repeatDelayMs,
        emitScan,
        emitError,
    ]);

    return {
        videoRef: camera.videoRef,
        status: camera.status,
        error: camera.error,
        supported,
        formats,
        scanning,
        result,
        torch,
        retry: camera.retry,
    };
}

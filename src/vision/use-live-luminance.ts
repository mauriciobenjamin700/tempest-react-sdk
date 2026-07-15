import { useEffect, useRef, useState, type RefObject } from "react";
import { computeImageLuminance } from "./luminance";

/** Options for {@link useLiveLuminance}. */
export interface UseLiveLuminanceOptions {
    /** When `false` the loop is paused (e.g. while a capture is in flight). Default: `true`. */
    enabled?: boolean;
    /** Throttle measurements in milliseconds. Default: `160` (~6 fps), plenty for UX. */
    intervalMs?: number;
}

/**
 * Sample mean luminance from a `<video>` source on a `requestAnimationFrame`
 * loop and expose the rolling value. Sampling is throttled by `intervalMs` and
 * paused whenever `enabled` is `false` or the video is not ready yet
 * (`readyState < 2` or `videoWidth === 0`).
 *
 * One offscreen canvas is reused across frames to avoid GC pressure. Designed
 * to feed a live brightness bar / border color on a camera page.
 *
 * @param videoRef - ref to the `<video>` element to sample.
 * @param options - optional configuration (see {@link UseLiveLuminanceOptions}).
 * @returns The rolling mean luminance in `0..255` (`0` until the first sample).
 */
export function useLiveLuminance(
    videoRef: RefObject<HTMLVideoElement | null>,
    { enabled = true, intervalMs = 160 }: UseLiveLuminanceOptions = {},
): number {
    const [luminance, setLuminance] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!enabled) return;
        if (typeof window === "undefined") return;
        if (!canvasRef.current) canvasRef.current = document.createElement("canvas");

        let rafId = 0;
        let lastSampledAt = 0;

        const tick = (timestamp: number): void => {
            const video = videoRef.current;
            if (!video || video.readyState < 2 || video.videoWidth === 0) {
                rafId = window.requestAnimationFrame(tick);
                return;
            }
            if (timestamp - lastSampledAt >= intervalMs) {
                lastSampledAt = timestamp;
                setLuminance(computeImageLuminance(video, canvasRef.current ?? undefined));
            }
            rafId = window.requestAnimationFrame(tick);
        };

        rafId = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(rafId);
    }, [videoRef, enabled, intervalMs]);

    return luminance;
}

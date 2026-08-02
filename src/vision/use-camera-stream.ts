import { useEffect, useRef, useState, type RefObject } from "react";

import {
    classifyMediaError,
    missingCaptureApiError,
    type MediaAccessError,
} from "@/audio/media-access";

/** Lifecycle status of the camera stream. */
export type CameraStreamStatus = "idle" | "loading" | "ready" | "error";

/** Classified reason a camera stream could not be acquired. */
export type CameraStreamErrorKind =
    "unsupported" | "permission-denied" | "no-camera" | "in-use" | "insecure" | "unknown";

/** A classified camera error with a human-readable, English message. */
export interface CameraStreamError {
    kind: CameraStreamErrorKind;
    message: string;
}

/** Options for {@link useCameraStream}. */
export interface UseCameraStreamOptions {
    /**
     * Constraints passed to `getUserMedia`. Defaults to the rear
     * ("environment") camera at Full-HD ideal resolution with audio off.
     * Read when the stream (re)starts — change it and call `retry()` to apply.
     */
    constraints?: MediaStreamConstraints;
    /**
     * Hold off acquiring the camera until this is `true`. Default `true`.
     *
     * The point is to be able to *not* prompt. A permission prompt costs the user a
     * decision and, if they refuse, costs the app the feature permanently — so a
     * surface that already knows it cannot do its job (a barcode scanner in a browser
     * with no decoder) must not open the camera to then say so. Flipping this to `false`
     * also releases a stream that is already live.
     */
    enabled?: boolean;
}

/** Value returned by {@link useCameraStream}. */
export interface UseCameraStreamApi {
    /** Current lifecycle status. */
    status: CameraStreamStatus;
    /** The classified error, or `null` while not in the `error` status. */
    error: CameraStreamError | null;
    /** Attach to a `<video ref={…} />`. The stream is wired to it once ready. */
    videoRef: RefObject<HTMLVideoElement | null>;
    /**
     * The live stream, or `null`.
     *
     * Exposed for the things that need the **track** rather than the picture — the LED
     * torch (`useTorch`), the real frame size from `getSettings()`, recording it with
     * `useVideoRecorder`. Do not stop it yourself: the hook owns its lifetime and
     * releases it on unmount and on `retry()`.
     */
    stream: MediaStream | null;
    /** Manually re-attempt after an error (e.g. the user changed permissions). */
    retry: () => void;
}

/** Rear-camera Full-HD defaults used when no `constraints` are supplied. */
const DEFAULT_CONSTRAINTS: MediaStreamConstraints = {
    video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
    },
    audio: false,
};

/**
 * Re-label a {@link MediaAccessError} as a {@link CameraStreamError}.
 *
 * The classification itself lives in one place for the whole SDK
 * (`classifyMediaError`), so a microphone and a camera failure are never explained
 * two different ways. Only the name of one kind differs: this surface shipped
 * `"no-camera"` where the shared taxonomy says `"not-found"`, and renaming a
 * published union member would break every consumer switching on it.
 *
 * @param error - The shared classification.
 * @returns The same error under this module's kind names.
 */
function toCameraError({ kind, message }: MediaAccessError): CameraStreamError {
    return { kind: kind === "not-found" ? "no-camera" : kind, message };
}

/**
 * Map an unknown `getUserMedia` failure into a {@link CameraStreamError}. Secure-context
 * and environment checks run first (they are the reason `getUserMedia` is missing or
 * rejects), then the `DOMException.name` is mapped to a stable `kind`.
 */
function classifyError(err: unknown): CameraStreamError {
    return toCameraError(classifyMediaError(err, "camera"));
}

/**
 * Acquire a `MediaStream` via `getUserMedia`, attach it to a `<video>` element,
 * and expose status/error so the page can render permission and error states.
 * The stream is automatically released on unmount or retry.
 *
 * Defaults to the rear ("environment") camera; desktops fall back to whatever
 * single camera they expose. Pass `options.constraints` to override, or
 * `options.enabled: false` to render the surface without prompting for the camera
 * at all.
 *
 * Implementation notes:
 * - Cleanup detaches the stream from a *snapshotted* video node, so it releases
 *   the same element it attached to even if the page remounts the `<video>`.
 * - When `getUserMedia` is missing, an insecure context is the usual cause, so
 *   the hook prefers that (actionable) error; otherwise it reports `unsupported`.
 * - `video.play()` rejections are swallowed: autoplay may be blocked, but the
 *   user gesture that opened the camera usually counts and playback resumes on
 *   the next interaction.
 *
 * @param options - optional configuration (see {@link UseCameraStreamOptions}).
 * @returns The stream status, classified error, a `videoRef` to attach, the live
 *   `stream` for whatever needs the track itself, and a `retry()` to re-attempt
 *   acquisition.
 */
export function useCameraStream(options: UseCameraStreamOptions = {}): UseCameraStreamApi {
    const [status, setStatus] = useState<CameraStreamStatus>("loading");
    const [error, setError] = useState<CameraStreamError | null>(null);
    const [live, setLive] = useState<MediaStream | null>(null);
    const [retryToken, setRetryToken] = useState(0);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const constraintsRef = useRef<MediaStreamConstraints>(
        options.constraints ?? DEFAULT_CONSTRAINTS,
    );
    useEffect(() => {
        constraintsRef.current = options.constraints ?? DEFAULT_CONSTRAINTS;
    }, [options.constraints]);

    const enabled = options.enabled ?? true;

    useEffect(() => {
        let cancelled = false;
        let stream: MediaStream | null = null;
        let attachedVideo: HTMLVideoElement | null = null;

        async function start(): Promise<void> {
            if (!enabled) {
                setStatus("idle");
                setError(null);
                return;
            }
            setStatus("loading");
            setError(null);

            if (
                typeof navigator === "undefined" ||
                !navigator.mediaDevices ||
                typeof navigator.mediaDevices.getUserMedia !== "function"
            ) {
                if (!cancelled) {
                    setError(toCameraError(missingCaptureApiError("camera")));
                    setStatus("error");
                }
                return;
            }

            try {
                stream = await navigator.mediaDevices.getUserMedia(constraintsRef.current);
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                const video = videoRef.current;
                if (!video) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                attachedVideo = video;
                video.srcObject = stream;
                setLive(stream);
                await video.play().catch(() => undefined);
                if (!cancelled) setStatus("ready");
            } catch (err) {
                if (!cancelled) {
                    setError(classifyError(err));
                    setStatus("error");
                }
            }
        }

        void start();

        return () => {
            cancelled = true;
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
            if (attachedVideo) {
                attachedVideo.srcObject = null;
            }
            setLive(null);
        };
    }, [retryToken, enabled]);

    return {
        status,
        error,
        videoRef,
        stream: live,
        retry: () => setRetryToken((n) => n + 1),
    };
}

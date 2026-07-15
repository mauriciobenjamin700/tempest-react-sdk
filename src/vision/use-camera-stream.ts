import { useEffect, useRef, useState, type RefObject } from "react";

/** Lifecycle status of the camera stream. */
export type CameraStreamStatus = "idle" | "loading" | "ready" | "error";

/** Classified reason a camera stream could not be acquired. */
export type CameraStreamErrorKind =
    | "unsupported"
    | "permission-denied"
    | "no-camera"
    | "in-use"
    | "insecure"
    | "unknown";

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
}

/** Value returned by {@link useCameraStream}. */
export interface UseCameraStreamApi {
    /** Current lifecycle status. */
    status: CameraStreamStatus;
    /** The classified error, or `null` while not in the `error` status. */
    error: CameraStreamError | null;
    /** Attach to a `<video ref={…} />`. The stream is wired to it once ready. */
    videoRef: RefObject<HTMLVideoElement | null>;
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
 * Map an unknown failure into a {@link CameraStreamError}. Secure-context and
 * environment checks run first (they are the reason `getUserMedia` is missing
 * or rejects), then the `DOMException.name` is mapped to a stable `kind`.
 */
function classifyError(err: unknown): CameraStreamError {
    if (typeof window === "undefined") {
        return { kind: "unsupported", message: "Camera is unavailable in this environment." };
    }
    if (!window.isSecureContext) {
        return {
            kind: "insecure",
            message: "Camera access requires a secure (HTTPS) connection.",
        };
    }
    if (err instanceof DOMException) {
        switch (err.name) {
            case "NotAllowedError":
            case "SecurityError":
                return {
                    kind: "permission-denied",
                    message: "Camera permission denied. Enable access in your browser settings.",
                };
            case "NotFoundError":
            case "OverconstrainedError":
                return {
                    kind: "no-camera",
                    message: "No camera available on this device.",
                };
            case "NotReadableError":
            case "AbortError":
                return {
                    kind: "in-use",
                    message: "The camera is in use by another app. Close it and try again.",
                };
        }
    }
    return {
        kind: "unknown",
        message:
            err instanceof Error ? err.message : "Unexpected error while accessing the camera.",
    };
}

/**
 * Acquire a `MediaStream` via `getUserMedia`, attach it to a `<video>` element,
 * and expose status/error so the page can render permission and error states.
 * The stream is automatically released on unmount or retry.
 *
 * Defaults to the rear ("environment") camera; desktops fall back to whatever
 * single camera they expose. Pass `options.constraints` to override.
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
 * @returns The stream status, classified error, a `videoRef` to attach, and a
 *   `retry()` to re-attempt acquisition.
 */
export function useCameraStream(options: UseCameraStreamOptions = {}): UseCameraStreamApi {
    const [status, setStatus] = useState<CameraStreamStatus>("loading");
    const [error, setError] = useState<CameraStreamError | null>(null);
    const [retryToken, setRetryToken] = useState(0);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const constraintsRef = useRef<MediaStreamConstraints>(
        options.constraints ?? DEFAULT_CONSTRAINTS,
    );
    constraintsRef.current = options.constraints ?? DEFAULT_CONSTRAINTS;

    useEffect(() => {
        let cancelled = false;
        let stream: MediaStream | null = null;
        let attachedVideo: HTMLVideoElement | null = null;

        async function start(): Promise<void> {
            setStatus("loading");
            setError(null);

            if (
                typeof navigator === "undefined" ||
                !navigator.mediaDevices ||
                typeof navigator.mediaDevices.getUserMedia !== "function"
            ) {
                if (!cancelled) {
                    setError(
                        typeof window !== "undefined" && !window.isSecureContext
                            ? classifyError(null)
                            : {
                                  kind: "unsupported",
                                  message: "Camera capture is not supported in this browser.",
                              },
                    );
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
        };
    }, [retryToken]);

    return {
        status,
        error,
        videoRef,
        retry: () => setRetryToken((n) => n + 1),
    };
}

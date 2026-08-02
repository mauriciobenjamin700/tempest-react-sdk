/** Which capture device a media error is about. */
export type MediaDeviceKindLabel = "microphone" | "camera";

/** Classified reason a capture device could not be acquired. */
export type MediaAccessErrorKind =
    "unsupported" | "insecure" | "permission-denied" | "not-found" | "in-use" | "unknown";

/** A classified capture error with a human-readable, English message. */
export interface MediaAccessError {
    kind: MediaAccessErrorKind;
    message: string;
}

/** Sentence fragment naming the device, so one classifier serves both. */
const NOUN: Record<MediaDeviceKindLabel, string> = {
    microphone: "Microphone",
    camera: "Camera",
};

/**
 * Map an unknown `getUserMedia` failure into a {@link MediaAccessError}.
 *
 * The order matters. A missing `navigator.mediaDevices` is almost never "this
 * browser cannot do audio" — it is a page served over plain HTTP, where the whole
 * API is simply absent. Reporting `unsupported` there sends the developer looking
 * for a polyfill for a problem an `https://` URL fixes, so the secure-context check
 * runs first and wins.
 *
 * The `DOMException.name` values are then collapsed into kinds an app can actually
 * branch on, because the raw names do not group the way a UI needs them:
 * `NotFoundError` and `OverconstrainedError` both mean "you will not get a device
 * with these constraints", and `NotReadableError` and `AbortError` both mean "the
 * hardware is busy" — most often another tab of the same app.
 *
 * @param err - Whatever `getUserMedia` (or a device query) rejected with.
 * @param device - Which device was being opened, for the message.
 * @returns A stable kind plus a message safe to show a user.
 */
export function classifyMediaError(
    err: unknown,
    device: MediaDeviceKindLabel = "microphone",
): MediaAccessError {
    const noun = NOUN[device];

    if (typeof window === "undefined") {
        return { kind: "unsupported", message: `${noun} is unavailable in this environment.` };
    }
    if (!window.isSecureContext) {
        return {
            kind: "insecure",
            message: `${noun} access requires a secure (HTTPS) connection.`,
        };
    }
    if (err instanceof DOMException) {
        switch (err.name) {
            case "NotAllowedError":
            case "SecurityError":
                return {
                    kind: "permission-denied",
                    message: `${noun} permission denied. Enable access in your browser settings.`,
                };
            case "NotFoundError":
            case "OverconstrainedError":
                return {
                    kind: "not-found",
                    message: `No ${device} available on this device.`,
                };
            case "NotReadableError":
            case "AbortError":
                return {
                    kind: "in-use",
                    message: `The ${device} is in use by another app. Close it and try again.`,
                };
        }
    }
    return {
        kind: "unknown",
        message:
            err instanceof Error ? err.message : `Unexpected error while accessing the ${device}.`,
    };
}

/**
 * Whether `getUserMedia` is reachable at all.
 *
 * Separate from the classifier because a page often wants to hide a "record" button
 * entirely rather than render it and fail on click.
 */
export function isMediaCaptureSupported(): boolean {
    return (
        typeof navigator !== "undefined" &&
        navigator.mediaDevices !== undefined &&
        typeof navigator.mediaDevices.getUserMedia === "function"
    );
}

/**
 * The error for "the API is not here at all", which is a different question from
 * "the API rejected".
 *
 * `classifyMediaError` takes a thrown value; a missing `navigator.mediaDevices` never
 * threw one, and handing it `null` would come back `unknown` — the least actionable
 * kind there is. The two real causes are an insecure page (the fix is a URL) and an
 * engine that genuinely cannot capture (the fix is another browser), and telling them
 * apart is the whole point.
 *
 * @param device - Which device was being opened, for the message.
 */
export function missingCaptureApiError(
    device: MediaDeviceKindLabel = "microphone",
): MediaAccessError {
    if (typeof window !== "undefined" && !window.isSecureContext) {
        return classifyMediaError(null, device);
    }
    return {
        kind: "unsupported",
        message: `${NOUN[device]} capture is not supported in this browser.`,
    };
}

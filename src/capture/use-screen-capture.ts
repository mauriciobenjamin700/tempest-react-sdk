import { useCallback, useEffect, useRef, useState } from "react";

import {
    classifyMediaError,
    missingCaptureApiError,
    type MediaAccessError,
} from "@/audio/media-access";
import { useStableCallback } from "@/hooks/use-stable-callback";

/** Lifecycle of a screen share. */
export type ScreenCaptureStatus = "idle" | "requesting" | "sharing" | "error";

/** Which surface to put first in the picker. */
export type DisplaySurfaceHint = "monitor" | "window" | "browser";

/**
 * Hints `getDisplayMedia` takes that TypeScript's `DisplayMediaStreamOptions` does not
 * list yet.
 */
type DisplayMediaOptionsWithHints = DisplayMediaStreamOptions & {
    preferCurrentTab?: boolean;
    selfBrowserSurface?: "include" | "exclude";
    surfaceSwitching?: "include" | "exclude";
    systemAudio?: "include" | "exclude";
};

/** `displaySurface` is a constrainable property of a display track, but not in the DOM lib. */
type DisplayVideoConstraints = MediaTrackConstraints & { displaySurface?: DisplaySurfaceHint };

/** Options for {@link useScreenCapture}. */
export interface UseScreenCaptureOptions {
    /**
     * Capture the tab's audio too. Default `false`.
     *
     * Chromium only offers this for a **tab** — sharing a window or a whole screen
     * yields no audio track no matter what you ask for, and Safari has no display
     * audio at all. Ask for it and check what you got.
     */
    audio?: boolean;
    /**
     * Which surface the picker should offer first — `"browser"` is a tab.
     *
     * A hint, never a guarantee: the user can always pick something else, and Firefox
     * ignores it. Read `surface` afterwards to learn what actually happened.
     */
    displaySurface?: DisplaySurfaceHint;
    /**
     * Put *this* tab at the top of the picker. Default `false`.
     *
     * The right setting for "record what you are seeing right now" in a support flow.
     * Chromium only.
     */
    preferCurrentTab?: boolean;
    /** Offer this tab in the list at all. `"exclude"` prevents the hall-of-mirrors capture. */
    selfBrowserSurface?: "include" | "exclude";
    /** Let the user switch to a different surface mid-share, without a new prompt. */
    surfaceSwitching?: "include" | "exclude";
    /** Include the system audio when a whole screen is shared. Chromium, Windows only. */
    systemAudio?: "include" | "exclude";
    /** Escape hatch: full options, replacing everything above. */
    options?: DisplayMediaStreamOptions;
    /**
     * The user stopped the share from the browser's own bar.
     *
     * The single most important callback here — see the note on
     * {@link useScreenCapture}.
     */
    onEnded?: () => void;
    /**
     * The user dismissed the picker. **Not an error.**
     *
     * Receives the rejection so an app that needs to tell a dismissal from an OS-level
     * block (macOS screen-recording permission) can look at the message. Most should
     * simply return the UI to its previous state.
     */
    onCancelled?: (reason: unknown) => void;
}

/** Value returned by {@link useScreenCapture}. */
export interface UseScreenCaptureResult {
    status: ScreenCaptureStatus;
    /** The live stream, or `null`. Feed it to {@link useVideoRecorder} or a `<video>`. */
    stream: MediaStream | null;
    /** Classified error, or `null`. A cancelled picker leaves this `null`. */
    error: MediaAccessError | null;
    /** What the user actually picked, when the browser reports it. */
    surface: string | null;
    /** Whether the stream carries an audio track — ask, do not assume. */
    hasAudio: boolean;
    /** `false` when `getDisplayMedia` is missing (every browser on iOS, insecure pages). */
    supported: boolean;
    /** Open the picker. Must be called from a user gesture. */
    start: () => void;
    /** Stop sharing from the app side. Fires nothing — you asked for it. */
    stop: () => void;
}

/** Whether `getDisplayMedia` is reachable at all. */
export function isScreenCaptureSupported(): boolean {
    return (
        typeof navigator !== "undefined" &&
        navigator.mediaDevices !== undefined &&
        typeof navigator.mediaDevices.getDisplayMedia === "function"
    );
}

/**
 * A rejection from `getDisplayMedia` that means "the user said no thanks".
 *
 * There is no distinct exception for a dismissed picker: closing it produces the same
 * `NotAllowedError` as a policy block, and some builds report `AbortError` instead. The
 * useful default is therefore to treat both as a cancellation, because a
 * display-capture prompt is **always** user-initiated — nothing can open it behind
 * their back — so the overwhelmingly likely cause is that they changed their mind, and
 * a red error toast for that punishes them for it. The rejection is handed to
 * `onCancelled` so the rarer causes stay diagnosable.
 */
function isCancellation(err: unknown): boolean {
    return (
        err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "AbortError")
    );
}

/**
 * Capture a screen, a window or a tab with `getDisplayMedia`.
 *
 * Three states decide whether this feels right, and two of them are easy to miss:
 *
 * - **The user dismissed the picker.** A rejection, but not a failure. It leaves
 *   `error` at `null` and the status back at `"idle"`, and calls `onCancelled`.
 * - **The user stopped the share from the browser's own bar.** Nothing in your UI was
 *   clicked and no promise rejects — the *only* signal is the video track's `ended`
 *   event, so the hook listens for it and clears the stream. Without that listener, an
 *   app shows "gravando" over a stream that is already dead.
 * - **The share is live.** `surface` says what was picked and `hasAudio` says whether
 *   audio actually came along, which is not what you asked for but what you got.
 *
 * The stream is owned here: `stop()` and unmount both release every track. A recorder
 * built on it (`useVideoRecorder`) deliberately does not, so stopping a recording
 * leaves the share running for the next take.
 *
 * @param options - See {@link UseScreenCaptureOptions}.
 * @returns The stream, its status, a classified error and `start`/`stop`.
 *
 * @example
 * const screen = useScreenCapture({ preferCurrentTab: true, onEnded: () => save() });
 * const rec = useVideoRecorder(screen.stream);
 * <button onClick={screen.start}>Compartilhar tela</button>
 */
export function useScreenCapture(options: UseScreenCaptureOptions = {}): UseScreenCaptureResult {
    const {
        audio = false,
        displaySurface,
        preferCurrentTab,
        selfBrowserSurface,
        surfaceSwitching,
        systemAudio,
        options: raw,
        onEnded,
        onCancelled,
    } = options;

    const [status, setStatus] = useState<ScreenCaptureStatus>("idle");
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<MediaAccessError | null>(null);
    const [surface, setSurface] = useState<string | null>(null);
    const [hasAudio, setHasAudio] = useState(false);
    const [supported] = useState(isScreenCaptureSupported);

    const streamRef = useRef<MediaStream | null>(null);
    const detach = useRef<(() => void) | null>(null);
    const generation = useRef(0);

    const emitEnded = useStableCallback(() => onEnded?.());
    const emitCancelled = useStableCallback((reason: unknown) => onCancelled?.(reason));

    const release = useCallback((): void => {
        detach.current?.();
        detach.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    const reset = useCallback((): void => {
        setStream(null);
        setSurface(null);
        setHasAudio(false);
    }, []);

    const stop = useCallback((): void => {
        generation.current += 1;
        release();
        reset();
        setStatus("idle");
        setError(null);
    }, [release, reset]);

    const start = useCallback((): void => {
        if (streamRef.current) return;
        const run = (generation.current += 1);
        setStatus("requesting");
        setError(null);

        if (!isScreenCaptureSupported()) {
            setError(missingCaptureApiError("screen"));
            setStatus("error");
            return;
        }

        const video: DisplayVideoConstraints = displaySurface ? { displaySurface } : {};
        const request: DisplayMediaOptionsWithHints = raw ?? {
            video,
            audio,
            ...(preferCurrentTab !== undefined ? { preferCurrentTab } : {}),
            ...(selfBrowserSurface !== undefined ? { selfBrowserSurface } : {}),
            ...(surfaceSwitching !== undefined ? { surfaceSwitching } : {}),
            ...(systemAudio !== undefined ? { systemAudio } : {}),
        };

        void navigator.mediaDevices
            .getDisplayMedia(request)
            .then((next) => {
                if (run !== generation.current) {
                    next.getTracks().forEach((track) => track.stop());
                    return;
                }
                streamRef.current = next;
                const track = next.getVideoTracks()[0];
                const ended = (): void => {
                    if (run !== generation.current) return;
                    release();
                    reset();
                    setStatus("idle");
                    emitEnded();
                };
                track?.addEventListener("ended", ended);
                detach.current = () => track?.removeEventListener("ended", ended);

                setStream(next);
                setSurface(track?.getSettings().displaySurface ?? null);
                setHasAudio(next.getAudioTracks().length > 0);
                setStatus("sharing");
            })
            .catch((err: unknown) => {
                if (run !== generation.current) return;
                if (isCancellation(err)) {
                    setStatus("idle");
                    emitCancelled(err);
                    return;
                }
                setError(classifyMediaError(err, "screen"));
                setStatus("error");
            });
    }, [
        audio,
        displaySurface,
        preferCurrentTab,
        selfBrowserSurface,
        surfaceSwitching,
        systemAudio,
        raw,
        release,
        reset,
        emitEnded,
        emitCancelled,
    ]);

    useEffect(() => release, [release]);

    return { status, stream, error, surface, hasAudio, supported, start, stop };
}

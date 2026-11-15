import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    classifyMediaError,
    isMediaCaptureSupported,
    missingCaptureApiError,
    type MediaAccessError,
    type MediaAccessErrorKind,
} from "./media-access";

/** Lifecycle of a microphone stream. */
export type MicrophoneStatus = "idle" | "requesting" | "ready" | "error";

/** Options for {@link useMicrophone}. */
export interface UseMicrophoneOptions {
    /**
     * Open the stream on mount instead of waiting for `start()`. Default `false`.
     *
     * Left off on purpose. Opening on mount means prompting on mount, and a
     * permission prompt the user did not provoke is the most reliable way to earn a
     * permanent "Block" — after which `getUserMedia` rejects without ever prompting
     * again. Wire `start()` to the button that needs the microphone.
     */
    autoStart?: boolean;
    /** Specific microphone, from `useMediaDevices().audioInputs`. */
    deviceId?: string;
    /**
     * Browser voice processing. All three default to `true`, which is what speech
     * wants; turn them off for music, where a gate chewing on a decaying note is
     * worse than the room noise it removes.
     */
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
    /** Escape hatch: full constraints, replacing everything above. */
    constraints?: MediaStreamConstraints;
    /**
     * The text of `error.message` for each error kind, replacing the built-in English
     * sentence — the hook's i18n. Kinds left out keep the English default.
     *
     * Applied when the error is read, not when it is caught, so switching locale while
     * the error is on screen re-labels it without asking for the microphone again; the
     * `kind` is untouched, so a UI that branches on it keeps working. Overriding
     * `"unknown"` replaces the browser's own error text, which is the only place that
     * carries the raw cause.
     *
     * @example
     * useMicrophone({
     *     messages: {
     *         "permission-denied": "Acesso ao microfone negado. Libere nas configurações do navegador.",
     *         "not-found": "Nenhum microfone encontrado neste aparelho.",
     *     },
     * });
     */
    messages?: Partial<Record<MediaAccessErrorKind, string>>;
}

/** Value returned by {@link useMicrophone}. */
export interface UseMicrophoneResult {
    status: MicrophoneStatus;
    /** The live stream, or `null`. Feed it to {@link useAudioRecorder} or an analyser. */
    stream: MediaStream | null;
    /**
     * Classified error, or `null` outside the `error` status. Its `message` is English
     * unless {@link UseMicrophoneOptions.messages} covers its `kind`.
     */
    error: MediaAccessError | null;
    /** Open the stream. Safe to call when already open — it is a no-op. */
    start: () => void;
    /** Release the microphone. The browser's recording indicator only clears here. */
    stop: () => void;
}

/**
 * Acquire a microphone `MediaStream`, classified errors included, and release it
 * properly.
 *
 * Releasing matters more than it looks. Every track has to be stopped by hand:
 * dropping the last reference to a `MediaStream` does **not** turn off the
 * microphone, so the browser keeps showing its recording indicator and the OS keeps
 * the device busy — which then makes the *next* `getUserMedia` fail with
 * `NotReadableError` in another tab. The hook stops tracks on `stop()`, on unmount,
 * and before re-opening.
 *
 * Pass `options.messages` to show the errors in the app's language.
 *
 * @param options - See {@link UseMicrophoneOptions}.
 * @returns The stream, its status, a classified error, and `start`/`stop`.
 *
 * @example
 * const mic = useMicrophone();
 * const recorder = useAudioRecorder(mic.stream);
 * <button onClick={mic.start}>Liberar microfone</button>
 */
export function useMicrophone(options: UseMicrophoneOptions = {}): UseMicrophoneResult {
    const {
        autoStart = false,
        deviceId,
        echoCancellation = true,
        noiseSuppression = true,
        autoGainControl = true,
        constraints,
        messages,
    } = options;

    const [status, setStatus] = useState<MicrophoneStatus>("idle");
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [caught, setCaught] = useState<MediaAccessError | null>(null);
    const override = caught ? messages?.[caught.kind] : undefined;
    const error = useMemo<MediaAccessError | null>(
        () =>
            caught && override !== undefined ? { kind: caught.kind, message: override } : caught,
        [caught, override],
    );
    const streamRef = useRef<MediaStream | null>(null);
    const generation = useRef(0);

    const release = useCallback((): void => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    const stop = useCallback((): void => {
        generation.current += 1;
        release();
        setStream(null);
        setStatus("idle");
        setCaught(null);
    }, [release]);

    const start = useCallback((): void => {
        if (streamRef.current) return;
        const run = (generation.current += 1);
        setStatus("requesting");
        setCaught(null);

        if (!isMediaCaptureSupported()) {
            setCaught(missingCaptureApiError("microphone"));
            setStatus("error");
            return;
        }

        const request: MediaStreamConstraints = constraints ?? {
            audio: {
                echoCancellation,
                noiseSuppression,
                autoGainControl,
                ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            },
            video: false,
        };

        void navigator.mediaDevices
            .getUserMedia(request)
            .then((next) => {
                if (run !== generation.current) {
                    next.getTracks().forEach((track) => track.stop());
                    return;
                }
                streamRef.current = next;
                setStream(next);
                setStatus("ready");
            })
            .catch((err: unknown) => {
                if (run !== generation.current) return;
                setCaught(classifyMediaError(err, "microphone"));
                setStatus("error");
            });
    }, [constraints, deviceId, echoCancellation, noiseSuppression, autoGainControl]);

    useEffect(() => {
        if (autoStart) start();
        // `start` is stable per constraint set; re-running on every identity change
        // would reopen the device on each render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoStart]);

    useEffect(() => release, [release]);

    return { status, stream, error, start, stop };
}

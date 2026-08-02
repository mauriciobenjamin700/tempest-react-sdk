import { useCallback, useEffect, useRef, useState } from "react";

import { useStableCallback } from "@/hooks/use-stable-callback";

import type { MediaRecorderHandle, MediaRecorderStatus } from "./media-recorder";
import {
    createVideoRecorder,
    type VideoRecorderOptions,
    type VideoRecording,
} from "./video-recorder";

/** Options for {@link useVideoRecorder}. */
export interface UseVideoRecorderOptions extends VideoRecorderOptions {
    /**
     * Stop automatically after this many milliseconds.
     *
     * Worth setting on anything user-facing, and more so than for audio: a minute of
     * 1080p at 2.5 Mbps is roughly 19 MB, so a recording left running by accident
     * fills memory an order of magnitude faster than a voice note does.
     */
    maxDurationMs?: number;
    /** Called once the recording is assembled, whether by `stop()` or `maxDurationMs`. */
    onRecorded?: (recording: VideoRecording) => void;
    /** How often the clock is published, in ms. Default 250. */
    tickMs?: number;
}

/** Value returned by {@link useVideoRecorder}. */
export interface UseVideoRecorderResult {
    status: MediaRecorderStatus;
    /** Recorded length so far, excluding paused time. */
    durationMs: number;
    /** The finished recording, or `null` before the first `stop()`. */
    recording: VideoRecording | null;
    /** Recorder-level error (encoder failure, share revoked mid-recording). */
    error: unknown;
    /** `false` when there is no stream yet, or the browser cannot record video. */
    ready: boolean;
    start: () => void;
    pause: () => void;
    resume: () => void;
    /** Stop and resolve with the recording. Also published on `recording`. */
    stop: () => Promise<VideoRecording | null>;
    /** Stop and throw the video away. */
    cancel: () => void;
}

/**
 * Record a video stream — from {@link useScreenCapture}, from a camera, or from a
 * canvas.
 *
 * Pass the stream in; the hook stays `ready: false` until there is one, so a page can
 * render the whole recorder UI before the user has picked a screen and simply have it
 * disabled.
 *
 * There is no level meter here, which is the one real difference from
 * `useAudioRecorder`: metering a screen share means opening an `AudioContext` on a
 * stream that usually has no audio track at all, and browsers cap the number of live
 * contexts. If you are recording a camera **and** want a level, run
 * `createLevelMeter` on the same stream yourself.
 *
 * The clock is published every `tickMs` (default 250 ms) rather than per frame: a
 * video recording UI shows `0:07`, and a hook that re-rendered its parent 60 times a
 * second to move a one-second counter would be the most expensive thing on the page.
 *
 * @param stream - The stream to record, or `null` while the picker is open.
 * @param options - See {@link UseVideoRecorderOptions}.
 *
 * @example
 * const screen = useScreenCapture();
 * const rec = useVideoRecorder(screen.stream, { maxDurationMs: 120_000 });
 * <button disabled={!rec.ready} onClick={rec.start}>Gravar tela</button>
 */
export function useVideoRecorder(
    stream: MediaStream | null,
    options: UseVideoRecorderOptions = {},
): UseVideoRecorderResult {
    const {
        maxDurationMs,
        onRecorded,
        onChunk,
        onError,
        mimeType,
        videoBitsPerSecond,
        audioBitsPerSecond,
        timesliceMs,
        tickMs = 250,
    } = options;

    const [status, setStatus] = useState<MediaRecorderStatus>("idle");
    const [durationMs, setDurationMs] = useState(0);
    const [recording, setRecording] = useState<VideoRecording | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [ready, setReady] = useState(false);

    const recorderRef = useRef<MediaRecorderHandle | null>(null);

    const emitRecorded = useStableCallback((result: VideoRecording) => onRecorded?.(result));
    const emitChunk = useStableCallback((chunk: Blob) => onChunk?.(chunk));
    const emitError = useStableCallback((err: unknown) => {
        setError(err);
        onError?.(err);
    });

    /**
     * Build the recorder for a stream, and tear it down when the stream changes.
     *
     * Rebuilt per stream because `MediaRecorder` is bound to the stream it was
     * constructed with: a user who stops sharing and picks a different window hands us
     * a new `MediaStream`, and reusing the old recorder would keep recording a surface
     * that no longer exists. Same reason for a container or bitrate change — both are
     * constructor arguments.
     */
    useEffect(() => {
        if (!stream) {
            setReady(false);
            return;
        }
        let recorder: MediaRecorderHandle;
        try {
            recorder = createVideoRecorder(stream, {
                mimeType,
                videoBitsPerSecond,
                audioBitsPerSecond,
                timesliceMs,
                onChunk: emitChunk,
                onError: emitError,
            });
        } catch (err) {
            setError(err);
            setReady(false);
            return;
        }
        recorderRef.current = recorder;
        setReady(true);
        setStatus("idle");

        return () => {
            if (recorder.status() === "recording" || recorder.status() === "paused") {
                recorder.cancel();
            }
            recorderRef.current = null;
            setReady(false);
        };
    }, [
        stream,
        mimeType,
        videoBitsPerSecond,
        audioBitsPerSecond,
        timesliceMs,
        emitChunk,
        emitError,
    ]);

    const stop = useCallback(async (): Promise<VideoRecording | null> => {
        const recorder = recorderRef.current;
        if (!recorder) return null;
        const current = recorder.status();
        if (current !== "recording" && current !== "paused") return null;
        const result = await recorder.stop();
        setStatus("stopped");
        setDurationMs(result.durationMs);
        setRecording(result);
        emitRecorded(result);
        return result;
    }, [emitRecorded]);

    /**
     * Publish the clock while something is running, and enforce `maxDurationMs`.
     *
     * The cap is checked on the same tick rather than with a `setTimeout` armed at
     * `start()`, because a paused recording must not keep counting toward it — a
     * timeout would fire while the user is paused on a slide.
     */
    useEffect(() => {
        if (status !== "recording" && status !== "paused") return;
        const id = setInterval(() => {
            const recorder = recorderRef.current;
            if (!recorder) return;
            const elapsed = recorder.durationMs();
            setDurationMs(elapsed);
            if (maxDurationMs !== undefined && elapsed >= maxDurationMs) void stop();
        }, tickMs);
        return () => clearInterval(id);
    }, [status, tickMs, maxDurationMs, stop]);

    const start = useCallback((): void => {
        const recorder = recorderRef.current;
        if (!recorder) return;
        setRecording(null);
        setError(null);
        setDurationMs(0);
        recorder.start();
        setStatus(recorder.status());
    }, []);

    const pause = useCallback((): void => {
        const recorder = recorderRef.current;
        if (!recorder) return;
        recorder.pause();
        setDurationMs(recorder.durationMs());
        setStatus(recorder.status());
    }, []);

    const resume = useCallback((): void => {
        const recorder = recorderRef.current;
        if (!recorder) return;
        recorder.resume();
        setStatus(recorder.status());
    }, []);

    const cancel = useCallback((): void => {
        const recorder = recorderRef.current;
        if (!recorder) return;
        recorder.cancel();
        setStatus("idle");
        setDurationMs(0);
        setRecording(null);
    }, []);

    return { status, durationMs, recording, error, ready, start, pause, resume, stop, cancel };
}

/**
 * @tempest-limits hook-lines — the hook is the recorder's lifecycle seen from React:
 * permission, the recorder handle, the clock, the level meter and the auto-stop
 * timer, all of which have to be torn down together on unmount. A second hook would
 * own half the teardown.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useStableCallback } from "@/hooks/use-stable-callback";

import {
    createAudioRecorder,
    type AudioRecorderHandle,
    type AudioRecorderOptions,
    type AudioRecorderStatus,
    type AudioRecording,
} from "./audio-recorder";
import { createLevelMeter, type LevelMeter } from "./level-meter";

/** Options for {@link useAudioRecorder}. */
export interface UseAudioRecorderOptions extends AudioRecorderOptions {
    /**
     * Stop automatically after this many milliseconds.
     *
     * Worth setting on anything user-facing: a recording left running by accident is
     * a memory buffer that grows until the tab dies.
     */
    maxDurationMs?: number;
    /** Called once the recording is assembled, whether by `stop()` or `maxDurationMs`. */
    onRecorded?: (recording: AudioRecording) => void;
    /** How often the clock and the level are published, in ms. Default 100. */
    tickMs?: number;
    /** Skip the level meter — it costs an `AudioContext`. Default `false`. */
    disableLevelMeter?: boolean;
}

/** Value returned by {@link useAudioRecorder}. */
export interface UseAudioRecorderResult {
    status: AudioRecorderStatus;
    /** Recorded length so far, excluding paused time. */
    durationMs: number;
    /** Loudness 0–1, or `0` when the meter is off or nothing is recording. */
    level: number;
    /** The finished recording, or `null` before the first `stop()`. */
    recording: AudioRecording | null;
    /** Recorder-level error (encoder failure, device pulled mid-recording). */
    error: unknown;
    /** `false` when there is no stream yet, or the browser cannot record. */
    ready: boolean;
    start: () => void;
    pause: () => void;
    resume: () => void;
    /** Stop and resolve with the recording. Also published on `recording`. */
    stop: () => Promise<AudioRecording | null>;
    /** Stop and throw the audio away. */
    cancel: () => void;
}

/**
 * Record the given stream, with a clock, a level meter and a state machine.
 *
 * Pass the stream from {@link useMicrophone}; the hook stays `ready: false` until
 * there is one, so a page can render the whole recorder UI before permission is
 * granted and simply have it disabled.
 *
 * The clock and the level are published on an interval (`tickMs`, default 100 ms)
 * rather than per animation frame. A hook that set state 60 times a second would
 * re-render everything the recorder is inside; 10 Hz is smooth enough for a timer and
 * a meter, and the underlying `createLevelMeter` is still available for anyone who
 * wants a frame-accurate bar written straight to the DOM.
 *
 * @param stream - The stream to record, or `null` while permission is pending.
 * @param options - See {@link UseAudioRecorderOptions}.
 *
 * @example
 * const mic = useMicrophone();
 * const rec = useAudioRecorder(mic.stream, { maxDurationMs: 120_000 });
 * <button disabled={!rec.ready} onClick={rec.start}>Gravar</button>
 */
export function useAudioRecorder(
    stream: MediaStream | null,
    options: UseAudioRecorderOptions = {},
): UseAudioRecorderResult {
    const {
        maxDurationMs,
        onRecorded,
        onChunk,
        onError,
        mimeType,
        audioBitsPerSecond,
        timesliceMs,
        tickMs = 100,
        disableLevelMeter = false,
    } = options;

    const [status, setStatus] = useState<AudioRecorderStatus>("idle");
    const [durationMs, setDurationMs] = useState(0);
    const [level, setLevel] = useState(0);
    const [recording, setRecording] = useState<AudioRecording | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [ready, setReady] = useState(false);

    const recorderRef = useRef<AudioRecorderHandle | null>(null);
    const meterRef = useRef<LevelMeter | null>(null);

    const emitRecorded = useStableCallback((result: AudioRecording) => onRecorded?.(result));
    const emitChunk = useStableCallback((chunk: Blob) => onChunk?.(chunk));
    const emitError = useStableCallback((err: unknown) => {
        setError(err);
        onError?.(err);
    });

    /**
     * Build the recorder and the meter for a stream, and tear both down when it
     * changes.
     *
     * The recorder is rebuilt per stream because `MediaRecorder` is bound to the
     * stream it was constructed with — swapping microphones mid-session hands us a
     * new `MediaStream`, and reusing the old recorder would keep recording the device
     * the user just switched away from. It is rebuilt on a container or bitrate change
     * for the same reason: both are constructor arguments.
     */
    useEffect(() => {
        if (!stream) {
            setReady(false);
            return;
        }
        let recorder: AudioRecorderHandle;
        try {
            recorder = createAudioRecorder(stream, {
                mimeType,
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
        meterRef.current = disableLevelMeter ? null : createLevelMeter(stream);
        setReady(true);
        setStatus("idle");

        return () => {
            if (recorder.status() === "recording" || recorder.status() === "paused") {
                recorder.cancel();
            }
            meterRef.current?.stop();
            meterRef.current = null;
            recorderRef.current = null;
            setReady(false);
        };
    }, [
        stream,
        disableLevelMeter,
        mimeType,
        audioBitsPerSecond,
        timesliceMs,
        emitChunk,
        emitError,
    ]);

    const stop = useCallback(async (): Promise<AudioRecording | null> => {
        const recorder = recorderRef.current;
        if (!recorder) return null;
        const current = recorder.status();
        if (current !== "recording" && current !== "paused") return null;
        const result = await recorder.stop();
        setStatus("stopped");
        setDurationMs(result.durationMs);
        setLevel(0);
        setRecording(result);
        emitRecorded(result);
        return result;
    }, [emitRecorded]);

    /**
     * Publish the clock and the level while something is running, and enforce
     * `maxDurationMs`.
     *
     * The cap is checked on the same tick rather than with a `setTimeout` armed at
     * `start()`, because a paused recording must not keep counting toward it — a
     * timeout would fire while the user is paused mid-sentence.
     */
    useEffect(() => {
        if (status !== "recording" && status !== "paused") {
            setLevel(0);
            return;
        }
        const id = setInterval(() => {
            const recorder = recorderRef.current;
            if (!recorder) return;
            const elapsed = recorder.durationMs();
            setDurationMs(elapsed);
            setLevel(status === "recording" ? (meterRef.current?.level() ?? 0) : 0);
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
        setLevel(0);
        setRecording(null);
    }, []);

    return {
        status,
        durationMs,
        level,
        recording,
        error,
        ready,
        start,
        pause,
        resume,
        stop,
        cancel,
    };
}

/** Lifecycle of a recording. */
export type AudioRecorderStatus = "idle" | "recording" | "paused" | "stopped";

/**
 * Container/codec candidates, best first.
 *
 * No browser supports all of these, and none supports MP3 or WAV from
 * `MediaRecorder` — see the note on {@link pickAudioMimeType}. Opus in WebM is the
 * first choice because it is the smallest at speech bitrates and is what Chromium
 * and Firefox produce natively; `audio/mp4` is here for Safari, which produces AAC
 * and nothing else.
 *
 * Ported from the intersection of what `MediaRecorder.isTypeSupported` accepts in
 * Chrome 120+, Firefox 115+ and Safari 17. Re-check against
 * <https://developer.mozilla.org/docs/Web/API/MediaRecorder/isTypeSupported> before
 * adding to the list.
 */
export const AUDIO_MIME_CANDIDATES: readonly string[] = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
];

/** A finished recording. */
export interface AudioRecording {
    /** The audio. Wrap with `useObjectUrl` to play it, or POST it as-is. */
    blob: Blob;
    /** What the browser actually produced — not necessarily what you asked for. */
    mimeType: string;
    /** Recorded length, excluding time spent paused. */
    durationMs: number;
}

/** Options for {@link createAudioRecorder}. */
export interface AudioRecorderOptions {
    /**
     * Force a container. Throws when the browser cannot produce it.
     *
     * Leave it out. The default negotiates from {@link AUDIO_MIME_CANDIDATES}, which
     * is the only way one call site works on both Chromium and Safari.
     */
    mimeType?: string;
    /** Target bitrate. 32000–64000 is plenty for speech in Opus. */
    audioBitsPerSecond?: number;
    /**
     * Emit a chunk every N ms through `onChunk`, for streaming upload.
     *
     * Without it the whole recording is buffered in memory until `stop()` — fine for
     * a voice note, not fine for an hour-long meeting.
     */
    timesliceMs?: number;
    /** Receives each chunk when `timesliceMs` is set. Chunks are **not** independently playable. */
    onChunk?: (chunk: Blob) => void;
    /** Recorder-level failure (device unplugged mid-recording, encoder error). */
    onError?: (error: unknown) => void;
}

/** Imperative recorder. */
export interface AudioRecorderHandle {
    /** Begin recording. No-op when already recording or paused. */
    start: () => void;
    /** Pause. The clock stops; `durationMs` freezes. */
    pause: () => void;
    /** Resume after `pause()`. */
    resume: () => void;
    /** Stop and resolve with the assembled recording. */
    stop: () => Promise<AudioRecording>;
    /** Stop and throw the audio away. */
    cancel: () => void;
    status: () => AudioRecorderStatus;
    /** Recorded length so far, excluding paused time. */
    durationMs: () => number;
    /** The negotiated container. */
    mimeType: string;
}

/** Whether `MediaRecorder` exists and can produce at least one audio container. */
export function isAudioRecordingSupported(): boolean {
    return typeof MediaRecorder !== "undefined" && pickAudioMimeType() !== null;
}

/**
 * First container in `preferred` the browser can actually produce, or `null`.
 *
 * **There is no MP3 or WAV here, and that is not an omission.** `MediaRecorder`
 * emits Opus (in WebM or Ogg) on Chromium and Firefox and AAC (in MP4) on Safari —
 * no engine implements an MP3 or WAV encoder for it. If a backend needs WAV,
 * {@link blobToWav} converts one client-side with no dependency; if it needs MP3,
 * transcode on the server. Shipping an MP3 encoder would mean a WASM build of the
 * order of 150 KB in every consumer's bundle to serve one format, which is the
 * trade this SDK does not make.
 *
 * @param preferred - Candidates, best first. Defaults to {@link AUDIO_MIME_CANDIDATES}.
 * @returns A supported MIME type, or `null` when none is.
 */
export function pickAudioMimeType(
    preferred: readonly string[] = AUDIO_MIME_CANDIDATES,
): string | null {
    if (typeof MediaRecorder === "undefined") return null;
    // Older WebViews ship `MediaRecorder` without the static probe. Assume the first
    // candidate rather than refusing outright — the constructor will tell us.
    if (typeof MediaRecorder.isTypeSupported !== "function") return preferred[0] ?? null;
    return preferred.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

/**
 * Wrap a `MediaStream` in a recorder with a real state machine and an honest clock.
 *
 * Two things `MediaRecorder` does not give you:
 *
 * - **A duration.** It reports none, and the `Blob` has no reliable one either —
 *   WebM written by `MediaRecorder` carries no duration in its header, which is why
 *   `<audio>` shows `Infinity` for a fresh recording. So the clock is kept here, and
 *   it subtracts paused time: a recorder that counts wall-clock through a pause
 *   reports a 30-second note as two minutes.
 * - **A promise from `stop()`.** The last chunk arrives *after* `stop()` returns, in
 *   a `dataavailable` event that fires before `onstop`. Assembling the blob in
 *   `onstop` is the only point where every chunk is in hand.
 *
 * The stream is **not** owned here: `stop()` leaves the microphone open so a retake
 * does not need a second permission round-trip. Release it with the owning
 * `useMicrophone().stop()`.
 *
 * @param stream - A live audio stream, usually from {@link useMicrophone}.
 * @param options - See {@link AudioRecorderOptions}.
 * @returns The imperative recorder.
 * @throws When `MediaRecorder` is unavailable, or an explicit `mimeType` is unsupported.
 */
export function createAudioRecorder(
    stream: MediaStream,
    options: AudioRecorderOptions = {},
): AudioRecorderHandle {
    const { mimeType: forced, audioBitsPerSecond, timesliceMs, onChunk, onError } = options;

    if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder is not available in this environment.");
    }
    const negotiated = forced ?? pickAudioMimeType();
    if (negotiated === null) {
        throw new Error("This browser cannot record any supported audio container.");
    }
    if (
        forced !== undefined &&
        typeof MediaRecorder.isTypeSupported === "function" &&
        !MediaRecorder.isTypeSupported(forced)
    ) {
        throw new Error(`This browser cannot record "${forced}".`);
    }

    const recorder = new MediaRecorder(stream, {
        mimeType: negotiated,
        ...(audioBitsPerSecond !== undefined ? { audioBitsPerSecond } : {}),
    });

    let chunks: Blob[] = [];
    let status: AudioRecorderStatus = "idle";
    let accumulatedMs = 0;
    let segmentStart = 0;
    let settle: ((recording: AudioRecording) => void) | null = null;
    let discard = false;

    const elapsed = (): number =>
        accumulatedMs + (status === "recording" ? Date.now() - segmentStart : 0);

    recorder.ondataavailable = (event: BlobEvent): void => {
        if (event.data.size === 0) return;
        if (discard) return;
        chunks.push(event.data);
        onChunk?.(event.data);
    };

    recorder.onerror = (event: Event): void => {
        onError?.((event as unknown as { error?: unknown }).error ?? event);
    };

    recorder.onstop = (): void => {
        const durationMs = elapsed();
        status = "stopped";
        const resolve = settle;
        settle = null;
        if (discard) {
            chunks = [];
            return;
        }
        // `recorder.mimeType` is the source of truth: a browser handed
        // `audio/webm;codecs=opus` may report plain `audio/webm` back.
        const type = recorder.mimeType || negotiated;
        resolve?.({ blob: new Blob(chunks, { type }), mimeType: type, durationMs });
        chunks = [];
    };

    return {
        mimeType: negotiated,
        status: () => status,
        durationMs: elapsed,

        start(): void {
            if (status === "recording" || status === "paused") return;
            chunks = [];
            accumulatedMs = 0;
            discard = false;
            segmentStart = Date.now();
            status = "recording";
            if (timesliceMs !== undefined) recorder.start(timesliceMs);
            else recorder.start();
        },

        pause(): void {
            if (status !== "recording") return;
            accumulatedMs += Date.now() - segmentStart;
            status = "paused";
            recorder.pause();
        },

        resume(): void {
            if (status !== "paused") return;
            segmentStart = Date.now();
            status = "recording";
            recorder.resume();
        },

        stop(): Promise<AudioRecording> {
            if (status === "idle" || status === "stopped") {
                return Promise.resolve({
                    blob: new Blob([], { type: negotiated }),
                    mimeType: negotiated,
                    durationMs: 0,
                });
            }
            // Stopping while paused needs no clock fix-up: `pause()` already folded
            // the last segment into `accumulatedMs`, and `elapsed()` adds nothing
            // while the status is not `"recording"`.
            return new Promise<AudioRecording>((resolve) => {
                settle = resolve;
                recorder.stop();
            });
        },

        cancel(): void {
            if (status === "idle" || status === "stopped") return;
            discard = true;
            settle = null;
            recorder.stop();
        },
    };
}

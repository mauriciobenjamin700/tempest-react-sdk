/**
 * @tempest-limits function-lines — the engine behind both the audio and the video
 * recorder: MIME negotiation, the state machine MediaRecorder does not give you, and
 * the clock kept by hand because a fresh WebM reports no duration. The clock has to
 * pause and resume with the state machine, so they are one closure.
 */
/** Lifecycle of a recording. */
export type MediaRecorderStatus = "idle" | "recording" | "paused" | "stopped";

/** What a track carries — used only to word the errors this engine throws. */
export type MediaRecordingKind = "audio" | "video";

/** A finished recording, whatever it was made of. */
export interface MediaRecording {
    /** The bytes. Wrap with `useObjectUrl` to play it, or POST it as-is. */
    blob: Blob;
    /** What the browser actually produced — not necessarily what you asked for. */
    mimeType: string;
    /** Recorded length, excluding time spent paused. */
    durationMs: number;
}

/** Options for {@link createMediaRecorder}. */
export interface MediaRecordingOptions {
    /**
     * Container candidates, best first. Required: this engine has no opinion about
     * codecs — the audio and video wrappers own that list.
     */
    candidates: readonly string[];
    /** Wording for the thrown messages ("cannot record any supported *video* container"). */
    kind: MediaRecordingKind;
    /** Force a container, bypassing the negotiation. Throws when unsupported. */
    mimeType?: string;
    /** Target audio bitrate. */
    audioBitsPerSecond?: number;
    /** Target video bitrate. Ignored by the browser on an audio-only stream. */
    videoBitsPerSecond?: number;
    /**
     * Emit a chunk every N ms through `onChunk`, for streaming upload.
     *
     * Without it the whole recording is buffered in memory until `stop()`.
     */
    timesliceMs?: number;
    /** Receives each chunk when `timesliceMs` is set. Chunks are **not** independently playable. */
    onChunk?: (chunk: Blob) => void;
    /** Recorder-level failure (device unplugged mid-recording, encoder error). */
    onError?: (error: unknown) => void;
}

/** Imperative recorder over one `MediaStream`. */
export interface MediaRecorderHandle {
    /** Begin recording. No-op when already recording or paused. */
    start: () => void;
    /** Pause. The clock stops; `durationMs` freezes. */
    pause: () => void;
    /** Resume after `pause()`. */
    resume: () => void;
    /** Stop and resolve with the assembled recording. */
    stop: () => Promise<MediaRecording>;
    /** Stop and throw the bytes away. */
    cancel: () => void;
    status: () => MediaRecorderStatus;
    /** Recorded length so far, excluding paused time. */
    durationMs: () => number;
    /** The negotiated container. */
    mimeType: string;
}

/**
 * First container in `preferred` the browser can actually produce, or `null`.
 *
 * @param preferred - Candidates, best first.
 * @returns A supported MIME type, or `null` when none is.
 */
export function pickRecordingMimeType(preferred: readonly string[]): string | null {
    if (typeof MediaRecorder === "undefined") return null;
    // Older WebViews ship `MediaRecorder` without the static probe. Assume the first
    // candidate rather than refusing outright — the constructor will tell us.
    if (typeof MediaRecorder.isTypeSupported !== "function") return preferred[0] ?? null;
    return preferred.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

/**
 * Wrap a `MediaStream` in a recorder with a real state machine and an honest clock.
 *
 * This is the engine behind both `createAudioRecorder` and `createVideoRecorder`; the
 * only thing it does not decide is which containers to try, because that is the one
 * part that genuinely differs between the two.
 *
 * Two things `MediaRecorder` does not give you:
 *
 * - **A duration.** It reports none, and the `Blob` has no reliable one either —
 *   WebM written by `MediaRecorder` carries no duration in its header, which is why
 *   `<audio>`/`<video>` shows `Infinity` for a fresh recording. So the clock is kept
 *   here, and it subtracts paused time: a recorder that counts wall-clock through a
 *   pause reports a 30-second note as two minutes.
 * - **A promise from `stop()`.** The last chunk arrives *after* `stop()` returns, in
 *   a `dataavailable` event that fires before `onstop`. Assembling the blob in
 *   `onstop` is the only point where every chunk is in hand.
 *
 * The stream is **not** owned here: `stop()` leaves the device open so a retake does
 * not need a second permission round-trip. Release it with the owning hook's `stop()`.
 *
 * @param stream - A live stream, from `getUserMedia` or `getDisplayMedia`.
 * @param options - See {@link MediaRecordingOptions}.
 * @returns The imperative recorder.
 * @throws When `MediaRecorder` is unavailable, or an explicit `mimeType` is unsupported.
 */
export function createMediaRecorder(
    stream: MediaStream,
    options: MediaRecordingOptions,
): MediaRecorderHandle {
    const {
        candidates,
        kind,
        mimeType: forced,
        audioBitsPerSecond,
        videoBitsPerSecond,
        timesliceMs,
        onChunk,
        onError,
    } = options;

    if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder is not available in this environment.");
    }
    const negotiated = forced ?? pickRecordingMimeType(candidates);
    if (negotiated === null) {
        throw new Error(`This browser cannot record any supported ${kind} container.`);
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
        ...(videoBitsPerSecond !== undefined ? { videoBitsPerSecond } : {}),
    });

    let chunks: Blob[] = [];
    let status: MediaRecorderStatus = "idle";
    let accumulatedMs = 0;
    let segmentStart = 0;
    let settle: ((recording: MediaRecording) => void) | null = null;
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
        // `video/webm;codecs=vp9,opus` may report plain `video/webm` back.
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

        stop(): Promise<MediaRecording> {
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
            return new Promise<MediaRecording>((resolve) => {
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

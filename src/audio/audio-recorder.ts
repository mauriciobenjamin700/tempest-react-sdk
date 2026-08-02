import {
    createMediaRecorder,
    pickRecordingMimeType,
    type MediaRecorderStatus,
} from "@/capture/media-recorder";

/** Lifecycle of a recording. Shared with the video recorder — the states are the same. */
export type AudioRecorderStatus = MediaRecorderStatus;

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
    return pickRecordingMimeType(preferred);
}

/**
 * Wrap a `MediaStream` in a recorder with a real state machine and an honest clock.
 *
 * The engine is shared with the video recorder (`createMediaRecorder`), because the
 * subtle parts are not audio-specific: `MediaRecorder` reports **no duration** (WebM
 * it writes carries none in its header, which is why `<audio>` shows `Infinity` for a
 * fresh recording) so the clock is kept by hand and subtracts paused time; and
 * `stop()` returns *before* the last `dataavailable` event, so the blob can only be
 * assembled in `onstop`. What stays here is the part that genuinely differs — the
 * container list.
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
    return createMediaRecorder(stream, {
        candidates: AUDIO_MIME_CANDIDATES,
        kind: "audio",
        mimeType: options.mimeType,
        audioBitsPerSecond: options.audioBitsPerSecond,
        timesliceMs: options.timesliceMs,
        onChunk: options.onChunk,
        onError: options.onError,
    });
}

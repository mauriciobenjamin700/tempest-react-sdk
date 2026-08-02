import {
    createMediaRecorder,
    pickRecordingMimeType,
    type MediaRecorderHandle,
    type MediaRecording,
} from "./media-recorder";

/**
 * Container/codec candidates for video, best first.
 *
 * VP9 in WebM leads because it is the best quality per byte that Chromium and Firefox
 * both encode natively; VP8 is the fallback for older Chromium and for hardware that
 * refuses VP9. `video/mp4` is last and exists for Safari, which produces H.264 in MP4
 * and nothing else — and only since Safari 14.1.
 *
 * Every candidate carries **Opus or AAC audio in the same container**, because a
 * screen recording with the tab's audio dropped is a support ticket, not a
 * simplification. On a stream with no audio track the browser simply omits it.
 *
 * Ported from the intersection of what `MediaRecorder.isTypeSupported` accepts in
 * Chrome 120+, Firefox 115+ and Safari 17. Re-check against
 * <https://developer.mozilla.org/docs/Web/API/MediaRecorder/isTypeSupported> before
 * adding to the list.
 */
export const VIDEO_MIME_CANDIDATES: readonly string[] = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
];

/**
 * A finished video recording.
 *
 * Structurally the same three fields as an audio one — there is nothing
 * video-specific to add, and inventing a `width`/`height` here would be a lie: the
 * browser negotiates the frame size with the device and can change it mid-recording.
 * Read it from the track's `getSettings()` if you need it.
 */
export type VideoRecording = MediaRecording;

/** Imperative video recorder. Same shape as the audio one. */
export type VideoRecorderHandle = MediaRecorderHandle;

/** Options for {@link createVideoRecorder}. */
export interface VideoRecorderOptions {
    /**
     * Force a container. Throws when the browser cannot produce it.
     *
     * Leave it out. The default negotiates from {@link VIDEO_MIME_CANDIDATES}, which
     * is the only way one call site works on both Chromium and Safari.
     */
    mimeType?: string;
    /**
     * Target video bitrate.
     *
     * The browser's default is conservative and a screen recording of text at
     * 1080p looks smeared under it. 2_500_000 is a good floor for a UI capture,
     * 8_000_000 for full-motion camera video.
     */
    videoBitsPerSecond?: number;
    /** Target audio bitrate, when the stream carries audio. 64000–128000 is plenty. */
    audioBitsPerSecond?: number;
    /**
     * Emit a chunk every N ms through `onChunk`, for streaming upload.
     *
     * Worth setting for video far sooner than for audio: a minute of 1080p at
     * 2.5 Mbps is roughly 19 MB sitting in memory.
     */
    timesliceMs?: number;
    /** Receives each chunk when `timesliceMs` is set. Chunks are **not** independently playable. */
    onChunk?: (chunk: Blob) => void;
    /** Recorder-level failure (screen share revoked mid-recording, encoder error). */
    onError?: (error: unknown) => void;
}

/** Whether `MediaRecorder` exists and can produce at least one video container. */
export function isVideoRecordingSupported(): boolean {
    return typeof MediaRecorder !== "undefined" && pickVideoMimeType() !== null;
}

/**
 * First video container in `preferred` the browser can actually produce, or `null`.
 *
 * @param preferred - Candidates, best first. Defaults to {@link VIDEO_MIME_CANDIDATES}.
 * @returns A supported MIME type, or `null` when none is.
 */
export function pickVideoMimeType(
    preferred: readonly string[] = VIDEO_MIME_CANDIDATES,
): string | null {
    return pickRecordingMimeType(preferred);
}

/**
 * Record a video stream — a camera, a screen share, or a `canvas.captureStream()`.
 *
 * The state machine, the clock that subtracts paused time and the `stop()` that
 * resolves in `onstop` with every chunk in hand are shared with the audio recorder
 * (see `createMediaRecorder`); what this adds is the container list and
 * `videoBitsPerSecond`.
 *
 * The stream is **not** owned here. For a screen share in particular, stopping the
 * recorder must not stop the sharing: a support flow usually records, stops, lets the
 * user look at the result and then records again.
 *
 * @param stream - A live stream carrying at least one video track.
 * @param options - See {@link VideoRecorderOptions}.
 * @returns The imperative recorder.
 * @throws When `MediaRecorder` is unavailable, or an explicit `mimeType` is unsupported.
 *
 * @example
 * const recorder = createVideoRecorder(stream, { videoBitsPerSecond: 2_500_000 });
 * recorder.start();
 * const { blob, durationMs } = await recorder.stop();
 */
export function createVideoRecorder(
    stream: MediaStream,
    options: VideoRecorderOptions = {},
): VideoRecorderHandle {
    return createMediaRecorder(stream, {
        candidates: VIDEO_MIME_CANDIDATES,
        kind: "video",
        mimeType: options.mimeType,
        videoBitsPerSecond: options.videoBitsPerSecond,
        audioBitsPerSecond: options.audioBitsPerSecond,
        timesliceMs: options.timesliceMs,
        onChunk: options.onChunk,
        onError: options.onError,
    });
}

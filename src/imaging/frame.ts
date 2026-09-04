/**
 * Reading one frame out of a `<video>`, at the instant you asked for.
 *
 * The current frame needs nothing from this file: `createImageBitmap` takes a
 * video element, so `resizeImage(video)` already works. A **chosen** instant is
 * the part every app writes by hand and writes wrong:
 *
 * ```ts
 * video.currentTime = 12.5;
 * await new Promise((r) => video.addEventListener("seeked", r, { once: true }));
 * ctx.drawImage(video, 0, 0);   // may draw the PREVIOUS frame
 * ```
 *
 * `seeked` says the seek finished, not that the frame for the new position is
 * composited and readable by `drawImage`. The symptom is the worst kind: it
 * works on the machine it was written on and produces the neighbouring frame
 * elsewhere, with no error and no log.
 *
 * `requestVideoFrameCallback` is the only signal that reports a frame having
 * been **presented** — and measuring it, 2026-09-04 in Chromium, settled how it
 * can be used here: it fires while the video **plays** and does **not** fire
 * for a seek on a paused element. So blocking a seek on it would stall every
 * capture for the whole timeout and then proceed anyway. Instead:
 *
 * - Capturing from a **playing** video waits for the next presented frame, so
 *   the pixels are demonstrably fresh. That is the screen-recording print.
 * - Capturing at an **instant** waits for `seeked` and then two animation
 *   frames, which is what a browser offers for a paused element.
 * - Capturing the current frame of a **paused** video waits for nothing: the
 *   frame on screen already is the frame.
 *
 * `confirmed` in the result says which of those happened, so a caller can tell
 * a demonstrably fresh frame from a best-effort one instead of guessing. A
 * seek-based capture reporting `confirmed: false` is the normal case, not a
 * warning sign.
 *
 * Three more traps come along for the ride:
 *
 * - **A recording may arrive with no duration.** `MediaRecorder` does not
 *   guarantee a duration in the WebM header, so the blob `useVideoRecorder`
 *   just handed you may report `Infinity` — and the video an app most wants to
 *   grab a frame from is exactly that one. Seeking past the end forces the
 *   browser to demux to the last frame, after which it knows the length; that
 *   probe runs here rather than in every caller. Chromium was measured writing
 *   the duration for a one-shot recording, so this is for the paths that omit
 *   it — chunked `timeslice` recording, and other engines.
 * - **A cross-origin video taints the canvas**, and the failure surfaces far
 *   from its cause, so it is re-thrown saying what to set.
 * - **Moving `currentTime` moves the player** somebody is watching; `restore`
 *   puts it back, and touches only what actually moved.
 */

import { FrameSeekError, ImageDecodeError } from "./exceptions";
import { resizeImage } from "./transform";
import type { CaptureFrameOptions, CapturedFrame } from "./types";

/** How long a seek and the frame after it may take, in milliseconds. */
export const DEFAULT_FRAME_TIMEOUT_MS = 3000;

/** `HTMLMediaElement.HAVE_CURRENT_DATA` — there are pixels for the current position. */
const HAVE_CURRENT_DATA = 2;

/** Below this, in seconds, a seek to `currentTime` is a seek to where we already are. */
const SAME_FRAME_EPSILON = 0.001;

/**
 * How long to wait for a presented frame, in milliseconds.
 *
 * Its own budget, not the caller's `timeoutMs`: this wait is an optimisation on
 * freshness, and a video playing at 24 fps presents one every 42 ms. Spending
 * seconds here would stall the capture for a guarantee the platform may simply
 * not be able to give.
 */
const FRAME_SETTLE_MS = 200;

/**
 * A video element that reports presented frames.
 *
 * Declared structurally rather than by augmenting `HTMLVideoElement`: this is a
 * published package, and widening a lib interface would widen it for every
 * consumer, in every file, whether they load a polyfill or not.
 *
 * The two members are one capability. The spec defines them together, so a
 * runtime with `requestVideoFrameCallback` and no `cancelVideoFrameCallback`
 * does not exist — guarding the second separately would add a branch no test
 * can honestly reach.
 */
type FrameCallbackVideo = HTMLVideoElement & {
    requestVideoFrameCallback: (callback: (now: number) => void) => number;
    cancelVideoFrameCallback: (handle: number) => void;
};

/**
 * Whether this element reports presented frames.
 *
 * @param video The element to test.
 * @returns `true` when the frame callback pair is available.
 */
function reportsFrames(video: HTMLVideoElement): video is FrameCallbackVideo {
    return typeof (video as Partial<FrameCallbackVideo>).requestVideoFrameCallback === "function";
}

/** Seek target that forces a demux to the end, to learn an unknown duration. */
const PAST_THE_END_SECONDS = 1e101;

/** The `AbortError` a caller's `signal` produces. */
function abortError(): DOMException {
    return new DOMException("The frame capture was aborted.", "AbortError");
}

/**
 * Wait for one media event, and clean up on every exit.
 *
 * @param video The element to listen on.
 * @param type The event to wait for.
 * @param timeoutMs How long to wait.
 * @param signal Optional abort signal.
 * @param whenLate Message for the {@link FrameSeekError} on timeout.
 * @returns Resolves when the event fires.
 * @throws {@link FrameSeekError} when the timeout is reached.
 */
function onceEvent(
    video: HTMLVideoElement,
    type: string,
    timeoutMs: number,
    signal: AbortSignal | undefined,
    whenLate: string,
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const finish = (settle: () => void): void => {
            clearTimeout(timer);
            video.removeEventListener(type, onEvent);
            signal?.removeEventListener("abort", onAbort);
            settle();
        };
        const onEvent = (): void => finish(resolve);
        const onAbort = (): void => finish(() => reject(abortError()));

        const timer = setTimeout(
            () => finish(() => reject(new FrameSeekError(whenLate))),
            timeoutMs,
        );
        video.addEventListener(type, onEvent);
        signal?.addEventListener("abort", onAbort);
    });
}

/**
 * Wait for the next frame the compositor presents.
 *
 * Only ever called for a **playing** element, because that is the only state in
 * which the callback fires — measured, not assumed. The timeout is the escape
 * for a hidden tab, which presents nothing at all.
 *
 * @param video A playing element that reports presented frames.
 * @returns `true` when a frame was presented, `false` when the wait expired.
 */
function nextPresentedFrame(video: FrameCallbackVideo): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
            video.cancelVideoFrameCallback(handle);
            resolve(false);
        }, FRAME_SETTLE_MS);
        const handle = video.requestVideoFrameCallback(() => {
            clearTimeout(timer);
            resolve(true);
        });
    });
}

/**
 * Let the compositor catch up after a seek on a paused element.
 *
 * Two animation frames is what a browser offers here: the frame callback does
 * not fire for a paused seek, so there is nothing to confirm against. A runtime
 * with no animation frames at all gets a macrotask — enough for a test
 * environment, not a promise about pixels.
 *
 * @returns Resolves once the wait is over. Never a confirmation.
 */
function settleAfterSeek(): Promise<void> {
    if (typeof requestAnimationFrame === "function") {
        return new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
    }
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * Wait for the freshest frame this element's state allows, and say which.
 *
 * @param video The element about to be read.
 * @param seeked Whether a seek just moved it.
 * @returns `true` when a presented frame was observed.
 */
async function awaitReadableFrame(video: HTMLVideoElement, seeked: boolean): Promise<boolean> {
    if (!video.paused && reportsFrames(video)) return await nextPresentedFrame(video);
    if (seeked) await settleAfterSeek();
    return false;
}

/**
 * Whether the element is fed by a live stream rather than by a file.
 *
 * A truthiness check rather than `!== null`: the property is absent in
 * environments that model only part of `HTMLMediaElement`, where comparing
 * against `null` would read every element as live.
 *
 * @param video The element to test.
 * @returns `true` when a `MediaStream` is playing into it.
 */
function isLiveStream(video: HTMLVideoElement): boolean {
    return Boolean(video.srcObject);
}

/**
 * The video's length in seconds, probing for it when the header lacks one.
 *
 * `MediaRecorder` does not guarantee a duration in the WebM it produces, so a
 * recording can report `Infinity` until something forces the browser to demux
 * to the end. That is what the seek past the end does — the same hack the
 * `AudioPlayer` uses, for the same reason: the value is not in the file.
 *
 * @param video The element to measure.
 * @param timeoutMs How long the probe may take.
 * @param signal Optional abort signal.
 * @returns The duration in seconds.
 * @throws {@link FrameSeekError} when the element is a live stream, or the
 *   probe produced no duration.
 */
async function resolveDuration(
    video: HTMLVideoElement,
    timeoutMs: number,
    signal: AbortSignal | undefined,
): Promise<number> {
    if (Number.isFinite(video.duration)) return video.duration;

    if (isLiveStream(video)) {
        throw new FrameSeekError(
            "This element is playing a live MediaStream, which has no timeline to seek: " +
                "there is no instant but now. Leave `atMs` out to capture the frame on screen.",
        );
    }

    const probed = onceEvent(
        video,
        "timeupdate",
        timeoutMs,
        signal,
        `The video reported no duration and the probe for it did not answer within ` +
            `${timeoutMs}ms, so there is no timeline to seek on.`,
    );
    video.currentTime = PAST_THE_END_SECONDS;
    await probed;

    if (!Number.isFinite(video.duration)) {
        throw new FrameSeekError(
            "This video still reports no duration after seeking past its end, so it has " +
                "no seekable timeline — a live HLS or DASH source behaves this way. Leave " +
                "`atMs` out to capture the frame on screen.",
        );
    }
    return video.duration;
}

/**
 * Move the video to an instant, and wait for that instant's frame.
 *
 * @param video The element to move.
 * @param atMs The instant, in milliseconds. Clamped to the duration.
 * @param timeoutMs How long the seek and the frame may take.
 * @param signal Optional abort signal.
 * @returns Whether a presented frame confirmed the new position.
 * @throws {@link FrameSeekError} when the video has no seekable timeline, or
 *   the seek did not land in time.
 */
async function seekTo(
    video: HTMLVideoElement,
    atMs: number,
    timeoutMs: number,
    signal: AbortSignal | undefined,
): Promise<boolean> {
    const duration = await resolveDuration(video, timeoutMs, signal);

    const target = Math.min(Math.max(atMs / 1000, 0), duration);
    if (Math.abs(video.currentTime - target) < SAME_FRAME_EPSILON) {
        return await awaitReadableFrame(video, false);
    }

    const seeked = onceEvent(
        video,
        "seeked",
        timeoutMs,
        signal,
        `The video did not finish seeking to ${target.toFixed(3)}s within ${timeoutMs}ms. ` +
            "Nothing was captured: a frame from the wrong instant is indistinguishable " +
            "from a correct one downstream.",
    );
    video.currentTime = target;
    await seeked;
    return await awaitReadableFrame(video, true);
}

/**
 * Re-throw a tainted-canvas failure saying what to fix.
 *
 * A cross-origin video without `crossOrigin` taints everything it is drawn
 * into, and the `SecurityError` then arrives from the encoder — one call away
 * from the element that caused it, wrapped in whatever the decode said.
 *
 * @param error What the imaging pipeline threw.
 * @returns The error to throw instead.
 */
function explained(error: unknown): unknown {
    const names = [error, (error as { cause?: unknown } | null)?.cause].map((candidate) =>
        typeof candidate === "object" && candidate !== null && "name" in candidate
            ? String((candidate as { name: unknown }).name)
            : "",
    );
    if (!names.includes("SecurityError")) return error;
    return new ImageDecodeError(
        "The video is cross-origin, so reading its pixels is not allowed. Set " +
            'crossOrigin="anonymous" on the element before the source loads, and serve the ' +
            "video with a permissive Access-Control-Allow-Origin.",
        { cause: error },
    );
}

/**
 * Put playback back where the capture found it, touching only what moved.
 *
 * Each half is guarded because writing `currentTime` **is** a seek, even when
 * the value is unchanged: a capture that was refused before it moved anything
 * — a live stream, an abort — would otherwise perturb the player it never
 * touched. And a capture that paused without needing to move still has to let
 * go of the pause.
 *
 * @param video The element to restore.
 * @param time Where `currentTime` was.
 * @param wasPlaying Whether it was playing before the capture paused it.
 */
function restorePlayback(video: HTMLVideoElement, time: number, wasPlaying: boolean): void {
    if (video.currentTime !== time) video.currentTime = time;
    if (wasPlaying && video.paused) void Promise.resolve(video.play()).catch(() => undefined);
}

/**
 * Capture a frame from a video as encoded image bytes.
 *
 * Without `atMs` it reads the frame on screen, which is what a screen or camera
 * recording wants — a print of what is being recorded. With `atMs` it seeks,
 * waits for that instant's frame to be presented, captures, and puts the player
 * back.
 *
 * @example Print of a screen recording in progress
 * ```ts
 * const shot = await captureFrame(videoRef.current!, {
 *     type: "image/webp",
 *     quality: 0.9,
 * });
 * await shareOrDownloadBlob(shot.blob, "print.webp");
 * ```
 *
 * @example A poster from ten seconds in, scaled down
 * ```ts
 * const poster = await captureFrame(video, { atMs: 10_000, width: 640 });
 * setPosterUrl(URL.createObjectURL(poster.blob));
 * console.log(`landed on ${poster.atMs}ms`);
 * ```
 *
 * @param video The element to read. It needs data — the capture waits for
 *   `loadeddata` when the element has none yet.
 * @param options Instant, output box, format, and how long to wait.
 * @returns The encoded frame, the instant it actually came from, and whether a
 *   presented frame confirmed that instant.
 * @throws {@link FrameSeekError} when the video has no data or no timeline in
 *   time, or the seek did not land.
 * @throws {@link ImageDecodeError} when the pixels cannot be read — a
 *   cross-origin video without `crossOrigin` is the common one.
 * @throws {@link ImageEncodeError} when the canvas produces no bytes.
 */
export async function captureFrame(
    video: HTMLVideoElement,
    options: CaptureFrameOptions = {},
): Promise<CapturedFrame> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_FRAME_TIMEOUT_MS;
    if (options.signal?.aborted === true) throw abortError();

    if (video.readyState < HAVE_CURRENT_DATA) {
        await onceEvent(
            video,
            "loadeddata",
            timeoutMs,
            options.signal,
            `The video had no frame to read within ${timeoutMs}ms (readyState ` +
                `${video.readyState}). Give it a source, or wait for it yourself.`,
        );
    }

    const { atMs: requestedMs } = options;
    const previousTime = video.currentTime;
    const wasPlaying = !video.paused;

    try {
        let confirmed: boolean;
        if (requestedMs === undefined) {
            confirmed = await awaitReadableFrame(video, false);
        } else {
            if (wasPlaying) video.pause();
            confirmed = await seekTo(video, requestedMs, timeoutMs, options.signal);
        }

        const atMs = video.currentTime * 1000;
        const encoded = await resizeImage(video, options);
        return { ...encoded, atMs, confirmed };
    } catch (error) {
        throw explained(error);
    } finally {
        if (options.restore !== false) restorePlayback(video, previousTime, wasPlaying);
    }
}

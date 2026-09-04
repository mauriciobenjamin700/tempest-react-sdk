/**
 * Unit tests for `captureFrame`.
 *
 * jsdom has no video decoder, no canvas and no `createImageBitmap`, and — this
 * is the part that matters here — **no seek algorithm at all**: writing
 * `currentTime` stores a number and fires nothing. So every `seeked` below is
 * dispatched by the test, which means these tests pin the orchestration (what
 * is waited for, in what order, what is cleaned up, what is reported) and
 * **cannot** pin the claim the function exists for: that a frame read after
 * `seeked` is the frame for the new position. That one needs a real browser and
 * a video whose frames carry their own index — `e2e/imaging.spec.ts`.
 *
 * `requestVideoFrameCallback` does not exist in jsdom either (zero occurrences
 * in its source), so the confirmed path only runs against a stub, and the
 * fallback is what runs for free.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { captureFrame } from "./frame";
import { FrameSeekError, ImageDecodeError } from "./exceptions";

const decode = {
    fails: null as Error | null,
    size: { width: 640, height: 360 },
};

class FakeContext {
    imageSmoothingEnabled = false;
    imageSmoothingQuality = "low";
    fillStyle = "";
    fillRect(): void {}
    drawImage(): void {}
}

class FakeOffscreenCanvas {
    constructor(
        public width: number,
        public height: number,
    ) {}
    getContext(): FakeContext {
        return new FakeContext();
    }
    async convertToBlob(options: { type: string }): Promise<Blob> {
        return new Blob([new Uint8Array(128)], { type: options.type });
    }
}

/** A `SecurityError` shaped like the one a tainted canvas produces. */
function securityError(): Error {
    const error = new Error("The operation is insecure.");
    error.name = "SecurityError";
    return error;
}

interface FakeVideo {
    video: HTMLVideoElement;
    /** Every write to `currentTime`, in order. */
    seeks: number[];
    /** Dispatch the event the browser would fire when a wait's condition is met. */
    settle: (type?: "seeked" | "loadeddata" | "timeupdate") => void;
    /** Run the pending frame callback, as the compositor would. */
    present: () => void;
    /** Whether a frame callback is waiting. */
    pending: () => boolean;
    paused: () => boolean;
    added: () => number;
    removed: () => number;
}

/**
 * A `<video>` with the four things jsdom hard-codes made controllable.
 *
 * `readyState`, `duration` and `paused` are read-only accessors on jsdom's
 * prototype, so they are shadowed per instance. `currentTime` is writable
 * there, but writing it fires nothing — recording the writes is how "did it
 * seek, and to where" gets asserted at all.
 *
 * @param options.readyState What the element reports having. Default `2`.
 * @param options.duration Length in seconds. Default `20`. `Infinity` is a live
 *     stream, which is a case the capture has to refuse.
 * @param options.frameCallback Whether `requestVideoFrameCallback` exists.
 * @returns The element and the handles to drive it.
 */
function fakeVideo(
    options: { readyState?: number; duration?: number; frameCallback?: boolean } = {},
): FakeVideo {
    const video = document.createElement("video");
    const seeks: number[] = [];
    let time = 0;
    let paused = true;
    let frame: (() => void) | null = null;

    Object.defineProperty(video, "readyState", {
        configurable: true,
        value: options.readyState ?? 2,
    });
    Object.defineProperty(video, "duration", {
        configurable: true,
        value: options.duration ?? 20,
    });
    Object.defineProperty(video, "paused", { configurable: true, get: () => paused });
    Object.defineProperty(video, "currentTime", {
        configurable: true,
        get: () => time,
        set: (value: number) => {
            time = value;
            seeks.push(value);
        },
    });
    video.pause = (): void => {
        paused = true;
    };
    video.play = async (): Promise<void> => {
        paused = false;
    };
    if (options.frameCallback !== false) {
        Object.assign(video, {
            requestVideoFrameCallback: (callback: () => void): number => {
                frame = callback;
                return 1;
            },
            cancelVideoFrameCallback: (): void => {
                frame = null;
            },
        });
    }

    const added = vi.spyOn(video, "addEventListener");
    const removed = vi.spyOn(video, "removeEventListener");

    return {
        video,
        seeks,
        settle: (type = "seeked") => video.dispatchEvent(new Event(type)),
        present: () => {
            const callback = frame;
            frame = null;
            callback?.();
        },
        pending: () => frame !== null,
        paused: () => paused,
        added: () => added.mock.calls.length,
        removed: () => removed.mock.calls.length,
    };
}

/** Let the capture reach its next wait before driving the element. */
async function settled(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

beforeEach(() => {
    decode.fails = null;
    decode.size = { width: 640, height: 360 };
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    vi.stubGlobal("createImageBitmap", async () => {
        if (decode.fails) throw decode.fails;
        return { ...decode.size, close: () => undefined };
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("captureFrame · the frame on screen", () => {
    it("reads the current frame without touching the timeline", async () => {
        const fake = fakeVideo();

        const shot = await captureFrame(fake.video, { type: "image/webp" });

        expect(fake.seeks).toEqual([]);
        expect(shot.blob.type).toBe("image/webp");
        expect([shot.width, shot.height]).toEqual([640, 360]);
        expect(shot.atMs).toBe(0);
        expect(shot.confirmed).toBe(false);
    });

    it("passes the output box and format through to the encoder", async () => {
        const fake = fakeVideo();

        const shot = await captureFrame(fake.video, { width: 320, type: "image/png" });

        expect([shot.width, shot.height]).toEqual([320, 180]);
        expect(shot.type).toBe("image/png");
        expect(shot.bytes).toBeGreaterThan(0);
    });

    it("waits for the first frame when the element has none yet", async () => {
        const fake = fakeVideo({ readyState: 0 });

        const capture = captureFrame(fake.video, { timeoutMs: 50 });
        await settled();
        fake.settle("loadeddata");

        await expect(capture).resolves.toMatchObject({ atMs: 0 });
    });

    it("gives up when no frame ever arrives, naming the readyState", async () => {
        const fake = fakeVideo({ readyState: 0 });

        await expect(captureFrame(fake.video, { timeoutMs: 10 })).rejects.toThrow(FrameSeekError);
        await expect(captureFrame(fake.video, { timeoutMs: 10 })).rejects.toThrow(/readyState 0/);
    });
});

describe("captureFrame · seeking to an instant", () => {
    /**
     * Measured in Chromium, 2026-09-04: `requestVideoFrameCallback` fires while
     * a video **plays** and does not fire for a seek on a paused element
     * (`pausedSeek=false`, `whilePlaying=true`). So a seek settles on animation
     * frames and reports `confirmed: false` — waiting on the callback here
     * would stall the capture for the whole timeout and then proceed anyway.
     */
    it("seeks, settles on animation frames, and does not claim confirmation", async () => {
        const frames = vi.fn((callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.stubGlobal("requestAnimationFrame", frames);
        const fake = fakeVideo();

        const capture = captureFrame(fake.video, { atMs: 12_500 });
        await settled();
        fake.settle();

        const shot = await capture;
        expect(fake.seeks[0]).toBe(12.5);
        expect(shot.atMs).toBe(12_500);
        expect(shot.confirmed).toBe(false);
        expect(frames).toHaveBeenCalledTimes(2);
        expect(fake.pending(), "never waits on a callback a paused seek cannot fire").toBe(false);
    });

    it("reports the instant it landed on, not the one asked for", async () => {
        const fake = fakeVideo();

        const capture = captureFrame(fake.video, { atMs: 12_500, restore: false });
        await settled();
        fake.video.currentTime = 12.466;
        fake.settle();

        await expect(capture).resolves.toMatchObject({ atMs: 12_466 });
    });

    it("clamps the instant to the timeline at both ends", async () => {
        for (const [asked, expected] of [
            [-5_000, 0],
            [999_000, 20],
        ] as const) {
            const fake = fakeVideo();
            fake.video.currentTime = 5;
            fake.seeks.length = 0;
            const capture = captureFrame(fake.video, { atMs: asked, restore: false });
            await settled();
            fake.settle();
            await capture;

            expect(fake.seeks.at(0)).toBe(expected);
        }
    });

    it("waits for nothing when it is already on that frame", async () => {
        const frames = vi.fn((callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.stubGlobal("requestAnimationFrame", frames);
        const fake = fakeVideo();

        await expect(captureFrame(fake.video, { atMs: 0 })).resolves.toMatchObject({
            confirmed: false,
        });

        expect(fake.seeks).toEqual([]);
        expect(frames, "nothing moved, so there is nothing to settle").not.toHaveBeenCalled();
    });

    it("refuses a live MediaStream without probing it", async () => {
        const fake = fakeVideo({ duration: Number.POSITIVE_INFINITY });
        Object.defineProperty(fake.video, "srcObject", { configurable: true, value: {} });

        await expect(captureFrame(fake.video, { atMs: 1_000 })).rejects.toThrow(FrameSeekError);
        await expect(captureFrame(fake.video, { atMs: 1_000 })).rejects.toThrow(/MediaStream/);
        expect(fake.seeks).toEqual([]);
    });

    /**
     * The video an app most wants a frame from is the one it just recorded, and
     * `MediaRecorder` writes no duration into the WebM header — so this path is
     * the common one, not the exotic one.
     */
    it("probes a recording whose header carries no duration, then seeks", async () => {
        const fake = fakeVideo({ duration: Number.POSITIVE_INFINITY });

        const capture = captureFrame(fake.video, { atMs: 1_500, restore: false });
        await settled();
        expect(fake.seeks).toEqual([1e101]);

        Object.defineProperty(fake.video, "duration", { configurable: true, value: 20 });
        fake.settle("timeupdate");
        await settled();
        fake.settle();

        await expect(capture).resolves.toMatchObject({ atMs: 1_500 });
        expect(fake.seeks).toEqual([1e101, 1.5]);
    });

    it("gives up when the probe brings no duration either", async () => {
        const fake = fakeVideo({ duration: Number.POSITIVE_INFINITY });

        const capture = captureFrame(fake.video, { atMs: 1_500, timeoutMs: 50 });
        await settled();
        fake.settle("timeupdate");

        await expect(capture).rejects.toThrow(/no seekable timeline/);
    });

    it("gives up when the probe never answers", async () => {
        const fake = fakeVideo({ duration: Number.POSITIVE_INFINITY });

        await expect(captureFrame(fake.video, { atMs: 1_500, timeoutMs: 10 })).rejects.toThrow(
            /probe for it did not answer/,
        );
    });

    it("fails rather than capture a frame it cannot vouch for", async () => {
        const fake = fakeVideo();

        const capture = captureFrame(fake.video, { atMs: 5_000, timeoutMs: 10 });

        await expect(capture).rejects.toThrow(FrameSeekError);
        await expect(capture).rejects.toThrow(/did not finish seeking to 5\.000s/);
    });
});

describe("captureFrame · how fresh the pixels are known to be", () => {
    it("waits for a presented frame while the video plays, and says so", async () => {
        const fake = fakeVideo();
        await fake.video.play();

        const capture = captureFrame(fake.video);
        await settled();
        expect(fake.pending()).toBe(true);
        fake.present();

        await expect(capture).resolves.toMatchObject({ confirmed: true });
        expect(fake.seeks, "reading the current frame moves nothing").toEqual([]);
    });

    /** A hidden tab presents no frames at all, so the wait has to expire. */
    it("captures anyway when a playing video presents no frame, unconfirmed", async () => {
        const fake = fakeVideo();
        await fake.video.play();

        await expect(captureFrame(fake.video)).resolves.toMatchObject({ confirmed: false });
    });

    it("settles on animation frames after a seek where the callback is absent", async () => {
        const frames = vi.fn((callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.stubGlobal("requestAnimationFrame", frames);
        const fake = fakeVideo({ frameCallback: false });

        const capture = captureFrame(fake.video, { atMs: 1_000, restore: false });
        await settled();
        fake.settle();

        await expect(capture).resolves.toMatchObject({ confirmed: false });
        expect(frames).toHaveBeenCalledTimes(2);
    });

    it("uses a macrotask where there are no animation frames either", async () => {
        vi.stubGlobal("requestAnimationFrame", undefined);
        const fake = fakeVideo({ frameCallback: false });

        const capture = captureFrame(fake.video, { atMs: 1_000, restore: false });
        await settled();
        fake.settle();

        await expect(capture).resolves.toMatchObject({ confirmed: false });
    });
});

describe("captureFrame · putting the player back", () => {
    it("restores the position and resumes playback by default", async () => {
        const fake = fakeVideo();
        await fake.video.play();
        fake.video.currentTime = 3;
        fake.seeks.length = 0;

        const capture = captureFrame(fake.video, { atMs: 12_000 });
        await settled();
        expect(fake.paused()).toBe(true);
        fake.settle();
        await capture;

        expect(fake.seeks).toEqual([12, 3]);
        expect(fake.paused()).toBe(false);
    });

    it("leaves the player parked on the captured frame when asked", async () => {
        const fake = fakeVideo();

        const capture = captureFrame(fake.video, { atMs: 12_000, restore: false });
        await settled();
        fake.settle();
        await capture;

        expect(fake.seeks).toEqual([12]);
    });

    it("swallows a refused resume, because autoplay policy is not the caller's problem", async () => {
        const fake = fakeVideo();
        await fake.video.play();
        fake.video.play = async (): Promise<void> => {
            throw new DOMException("play() failed", "NotAllowedError");
        };

        const capture = captureFrame(fake.video, { atMs: 8_000 });
        await settled();
        fake.settle();

        await expect(capture).resolves.toMatchObject({ atMs: 8_000 });
        await settled();
    });

    it("restores even when the capture failed", async () => {
        const fake = fakeVideo();
        fake.video.currentTime = 4;
        fake.seeks.length = 0;
        decode.fails = new Error("no pixels");

        const capture = captureFrame(fake.video, { atMs: 9_000 });
        await settled();
        fake.settle();

        await expect(capture).rejects.toThrow();
        expect(fake.seeks).toEqual([9, 4]);
    });
});

describe("captureFrame · the failures that arrive far from their cause", () => {
    it("explains a cross-origin video instead of forwarding the SecurityError", async () => {
        decode.fails = securityError();
        const fake = fakeVideo();

        const capture = captureFrame(fake.video);

        await expect(capture).rejects.toThrow(ImageDecodeError);
        await expect(captureFrame(fake.video)).rejects.toThrow(/crossOrigin="anonymous"/);
    });

    it("leaves an unrelated decode failure alone", async () => {
        decode.fails = new Error("not an image");
        const fake = fakeVideo();

        await expect(captureFrame(fake.video)).rejects.toThrow(/Could not decode/);
    });

    it("aborts before it touches the element", async () => {
        const fake = fakeVideo();

        await expect(
            captureFrame(fake.video, { atMs: 1_000, signal: AbortSignal.abort() }),
        ).rejects.toThrow(/aborted/);
        expect(fake.seeks).toEqual([]);
    });

    it("aborts a seek in flight", async () => {
        const fake = fakeVideo();
        const controller = new AbortController();

        const capture = captureFrame(fake.video, { atMs: 1_000, signal: controller.signal });
        await settled();
        controller.abort();

        await expect(capture).rejects.toThrow(/aborted/);
    });

    it("removes every listener it added, on success and on failure", async () => {
        const success = fakeVideo({ readyState: 0 });
        const capture = captureFrame(success.video, { atMs: 1_000, timeoutMs: 50 });
        await settled();
        success.settle("loadeddata");
        await settled();
        success.settle();
        await capture;
        expect(success.removed()).toBe(success.added());

        const failure = fakeVideo();
        await expect(captureFrame(failure.video, { atMs: 1_000, timeoutMs: 10 })).rejects.toThrow(
            FrameSeekError,
        );
        expect(failure.removed()).toBe(failure.added());
    });
});

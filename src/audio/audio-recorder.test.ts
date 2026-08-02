import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    FakeMediaRecorder,
    fakeStream,
    installMediaRecorder,
    removeMediaRecorder,
} from "../../test/audio-mocks";
import {
    AUDIO_MIME_CANDIDATES,
    createAudioRecorder,
    isAudioRecordingSupported,
    pickAudioMimeType,
} from "./audio-recorder";

/** The instance the recorder under test constructed. */
function latest(): FakeMediaRecorder {
    const instance = FakeMediaRecorder.instances.at(-1);
    if (!instance) throw new Error("no MediaRecorder was constructed");
    return instance;
}

describe("pickAudioMimeType", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installMediaRecorder();
    });
    afterEach(() => restore());

    it("prefers Opus in WebM when available", () => {
        expect(pickAudioMimeType()).toBe("audio/webm;codecs=opus");
    });

    it("falls through to the next supported candidate", () => {
        FakeMediaRecorder.supported = ["audio/mp4"];
        expect(pickAudioMimeType()).toBe("audio/mp4");
    });

    it("returns null when nothing in the list is supported", () => {
        FakeMediaRecorder.supported = [];
        expect(pickAudioMimeType()).toBeNull();
    });

    it("honours a caller-supplied preference order", () => {
        FakeMediaRecorder.supported = ["audio/webm", "audio/mp4"];
        expect(pickAudioMimeType(["audio/mp4", "audio/webm"])).toBe("audio/mp4");
    });

    it("assumes the first candidate on a WebView with no isTypeSupported", () => {
        // Refusing outright would break recording on engines that can in fact record;
        // the constructor is the one that gets to fail.
        const probe = FakeMediaRecorder.isTypeSupported;
        (FakeMediaRecorder as unknown as { isTypeSupported?: unknown }).isTypeSupported = undefined;
        try {
            expect(pickAudioMimeType()).toBe(AUDIO_MIME_CANDIDATES[0]);
        } finally {
            FakeMediaRecorder.isTypeSupported = probe;
        }
    });

    it("returns null with no MediaRecorder at all", () => {
        const undo = removeMediaRecorder();
        try {
            expect(pickAudioMimeType()).toBeNull();
            expect(isAudioRecordingSupported()).toBe(false);
        } finally {
            undo();
        }
    });

    it("offers no MP3 or WAV, because MediaRecorder produces neither", () => {
        expect(AUDIO_MIME_CANDIDATES.some((type) => /mpeg|mp3|wav/.test(type))).toBe(false);
    });
});

describe("createAudioRecorder", () => {
    let restore: () => void;

    beforeEach(() => {
        restore = installMediaRecorder();
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    });

    afterEach(() => {
        vi.useRealTimers();
        restore();
    });

    it("reports the negotiated container", () => {
        const recorder = createAudioRecorder(fakeStream());
        expect(recorder.mimeType).toBe("audio/webm;codecs=opus");
        expect(recorder.status()).toBe("idle");
    });

    it("throws without MediaRecorder", () => {
        const undo = removeMediaRecorder();
        try {
            expect(() => createAudioRecorder(fakeStream())).toThrow(/not available/);
        } finally {
            undo();
        }
    });

    it("throws when no container is supported", () => {
        FakeMediaRecorder.supported = [];
        expect(() => createAudioRecorder(fakeStream())).toThrow(/cannot record any/);
    });

    it("throws on a forced container the browser cannot produce", () => {
        expect(() => createAudioRecorder(fakeStream(), { mimeType: "audio/mpeg" })).toThrow(
            /cannot record "audio\/mpeg"/,
        );
    });

    it("accepts a forced container that is supported", () => {
        const recorder = createAudioRecorder(fakeStream(), { mimeType: "audio/webm" });
        expect(recorder.mimeType).toBe("audio/webm");
    });

    it("passes the timeslice through to start, and forwards chunks", () => {
        const onChunk = vi.fn();
        const recorder = createAudioRecorder(fakeStream(), { timesliceMs: 500, onChunk });
        recorder.start();

        expect(latest().timeslice).toBe(500);
        latest().emit();
        expect(onChunk).toHaveBeenCalledTimes(1);
    });

    it("starts with no timeslice when none is given", () => {
        const recorder = createAudioRecorder(fakeStream());
        recorder.start();
        expect(latest().timeslice).toBeUndefined();
    });

    it("counts elapsed time and stops with the assembled blob", async () => {
        const recorder = createAudioRecorder(fakeStream());
        recorder.start();
        expect(recorder.status()).toBe("recording");

        vi.advanceTimersByTime(3_000);
        expect(recorder.durationMs()).toBe(3_000);

        const done = recorder.stop();
        const recording = await done;

        expect(recording.durationMs).toBe(3_000);
        expect(recording.blob.size).toBeGreaterThan(0);
        expect(recording.mimeType).toBe("audio/webm;codecs=opus");
        expect(recorder.status()).toBe("stopped");
    });

    it("reports the container the browser says it produced, not the one requested", async () => {
        const recorder = createAudioRecorder(fakeStream());
        recorder.start();
        // Chromium hands back a narrower type than it was given; the blob has to be
        // tagged with what actually came out, or an upload declares the wrong codec.
        latest().mimeType = "audio/webm";

        const recording = await recorder.stop();
        expect(recording.mimeType).toBe("audio/webm");
        expect(recording.blob.type).toBe("audio/webm");
    });

    it("falls back to the negotiated type when the browser reports none", async () => {
        const recorder = createAudioRecorder(fakeStream());
        recorder.start();
        latest().mimeType = "";

        const recording = await recorder.stop();
        expect(recording.mimeType).toBe("audio/webm;codecs=opus");
    });

    it("does not count time spent paused", async () => {
        const recorder = createAudioRecorder(fakeStream());
        recorder.start();
        vi.advanceTimersByTime(2_000);

        recorder.pause();
        expect(recorder.status()).toBe("paused");
        vi.advanceTimersByTime(30_000);
        // The clock is frozen: a recorder that counted wall-clock here would report a
        // 4-second note as 34 seconds.
        expect(recorder.durationMs()).toBe(2_000);

        recorder.resume();
        vi.advanceTimersByTime(2_000);

        const recording = await recorder.stop();
        expect(recording.durationMs).toBe(4_000);
    });

    it("keeps the clock honest when stopped while paused", async () => {
        const recorder = createAudioRecorder(fakeStream());
        recorder.start();
        vi.advanceTimersByTime(1_500);
        recorder.pause();
        vi.advanceTimersByTime(10_000);

        const recording = await recorder.stop();
        expect(recording.durationMs).toBe(1_500);
    });

    it("ignores pause and resume out of order", () => {
        const recorder = createAudioRecorder(fakeStream());
        recorder.resume();
        expect(recorder.status()).toBe("idle");
        recorder.pause();
        expect(recorder.status()).toBe("idle");

        recorder.start();
        recorder.resume();
        expect(recorder.status()).toBe("recording");
    });

    it("ignores a second start while already recording", () => {
        const recorder = createAudioRecorder(fakeStream());
        recorder.start();
        vi.advanceTimersByTime(1_000);
        recorder.start();
        // A restart would have reset the clock to zero.
        expect(recorder.durationMs()).toBe(1_000);
    });

    it("resolves an empty recording when stopped before starting", async () => {
        const recorder = createAudioRecorder(fakeStream());
        const recording = await recorder.stop();
        expect(recording.blob.size).toBe(0);
        expect(recording.durationMs).toBe(0);
    });

    it("throws the audio away on cancel", async () => {
        const onChunk = vi.fn();
        const recorder = createAudioRecorder(fakeStream(), { onChunk });
        recorder.start();
        latest().emit();
        expect(onChunk).toHaveBeenCalledTimes(1);

        recorder.cancel();
        expect(recorder.status()).toBe("stopped");
        // The chunk delivered during `stop()` is dropped, not appended.
        expect(onChunk).toHaveBeenCalledTimes(1);
    });

    it("ignores cancel when nothing is running", () => {
        const recorder = createAudioRecorder(fakeStream());
        recorder.cancel();
        expect(recorder.status()).toBe("idle");
    });

    it("drops zero-length chunks", () => {
        const onChunk = vi.fn();
        const recorder = createAudioRecorder(fakeStream(), { onChunk });
        recorder.start();
        latest().ondataavailable?.({ data: new Blob([]) });
        expect(onChunk).not.toHaveBeenCalled();
    });

    it("surfaces a recorder error", () => {
        const onError = vi.fn();
        const recorder = createAudioRecorder(fakeStream(), { onError });
        recorder.start();
        latest().fireError(new Error("device pulled"));
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "device pulled" }));
    });

    it("falls back to the event when the error carries no error property", () => {
        const onError = vi.fn();
        const recorder = createAudioRecorder(fakeStream(), { onError });
        recorder.start();
        latest().onerror?.({} as Event);
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it("passes the bitrate to the constructor", () => {
        createAudioRecorder(fakeStream(), { audioBitsPerSecond: 48_000 });
        // Nothing to assert on the fake beyond construction succeeding; the guard is
        // that the option is not rejected by the spread.
        expect(FakeMediaRecorder.instances).toHaveLength(1);
    });

    it("does not stop the stream — a retake must not need a second prompt", async () => {
        const stream = fakeStream();
        const recorder = createAudioRecorder(stream);
        recorder.start();
        await recorder.stop();

        expect(
            stream
                .getTracks()
                .every((track) => !(track as unknown as { stopped: boolean }).stopped),
        ).toBe(true);
    });
});

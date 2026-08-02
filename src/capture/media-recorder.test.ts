import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    FakeMediaRecorder,
    fakeStream,
    installMediaRecorder,
    removeMediaRecorder,
} from "../../test/audio-mocks";
import { createMediaRecorder, pickRecordingMimeType } from "./media-recorder";

/** The instance the recorder under test constructed. */
function latest(): FakeMediaRecorder {
    const instance = FakeMediaRecorder.instances.at(-1);
    if (!instance) throw new Error("no MediaRecorder was constructed");
    return instance;
}

const VIDEO = ["video/webm;codecs=vp9,opus", "video/webm"];

describe("pickRecordingMimeType", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installMediaRecorder();
    });
    afterEach(() => restore());

    it("returns the first supported candidate", () => {
        FakeMediaRecorder.supported = VIDEO;
        expect(pickRecordingMimeType(VIDEO)).toBe("video/webm;codecs=vp9,opus");
    });

    it("returns null when nothing matches", () => {
        FakeMediaRecorder.supported = [];
        expect(pickRecordingMimeType(VIDEO)).toBeNull();
    });

    it("returns null for an empty candidate list on a WebView with no probe", () => {
        const probe = FakeMediaRecorder.isTypeSupported;
        (FakeMediaRecorder as unknown as { isTypeSupported?: unknown }).isTypeSupported = undefined;
        try {
            expect(pickRecordingMimeType([])).toBeNull();
        } finally {
            FakeMediaRecorder.isTypeSupported = probe;
        }
    });

    it("returns null with no MediaRecorder at all", () => {
        const undo = removeMediaRecorder();
        try {
            expect(pickRecordingMimeType(VIDEO)).toBeNull();
        } finally {
            undo();
        }
    });
});

describe("createMediaRecorder", () => {
    let restore: () => void;

    beforeEach(() => {
        restore = installMediaRecorder();
        FakeMediaRecorder.supported = VIDEO;
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    });

    afterEach(() => {
        vi.useRealTimers();
        restore();
    });

    it("words the container error with the kind it was given", () => {
        FakeMediaRecorder.supported = [];
        expect(() =>
            createMediaRecorder(fakeStream(), { candidates: VIDEO, kind: "video" }),
        ).toThrow(/cannot record any supported video container/);
    });

    it("passes both bitrates to the constructor", () => {
        createMediaRecorder(fakeStream(), {
            candidates: VIDEO,
            kind: "video",
            videoBitsPerSecond: 2_500_000,
            audioBitsPerSecond: 96_000,
        });
        expect(latest().options).toMatchObject({
            videoBitsPerSecond: 2_500_000,
            audioBitsPerSecond: 96_000,
        });
    });

    it("omits a bitrate that was not asked for", () => {
        createMediaRecorder(fakeStream(), { candidates: VIDEO, kind: "video" });
        expect(latest().options).not.toHaveProperty("videoBitsPerSecond");
        expect(latest().options).not.toHaveProperty("audioBitsPerSecond");
    });

    it("keeps one clock for audio and video alike", async () => {
        const recorder = createMediaRecorder(fakeStream(), { candidates: VIDEO, kind: "video" });
        recorder.start();
        vi.advanceTimersByTime(4_000);
        recorder.pause();
        vi.advanceTimersByTime(60_000);
        recorder.resume();
        vi.advanceTimersByTime(1_000);

        const recording = await recorder.stop();
        expect(recording.durationMs).toBe(5_000);
        expect(recording.mimeType).toBe("video/webm;codecs=vp9,opus");
    });
});

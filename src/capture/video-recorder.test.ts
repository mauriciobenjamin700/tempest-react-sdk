import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    FakeMediaRecorder,
    fakeVideoStream,
    installMediaRecorder,
    removeMediaRecorder,
} from "../../test/audio-mocks";
import {
    VIDEO_MIME_CANDIDATES,
    createVideoRecorder,
    isVideoRecordingSupported,
    pickVideoMimeType,
} from "./video-recorder";

/** The instance the recorder under test constructed. */
function latest(): FakeMediaRecorder {
    const instance = FakeMediaRecorder.instances.at(-1);
    if (!instance) throw new Error("no MediaRecorder was constructed");
    return instance;
}

describe("pickVideoMimeType", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installMediaRecorder();
    });
    afterEach(() => restore());

    it("prefers VP9 in WebM when available", () => {
        FakeMediaRecorder.supported = [...VIDEO_MIME_CANDIDATES];
        expect(pickVideoMimeType()).toBe("video/webm;codecs=vp9,opus");
    });

    it("falls through to MP4 on Safari, which produces nothing else", () => {
        FakeMediaRecorder.supported = ["video/mp4"];
        expect(pickVideoMimeType()).toBe("video/mp4");
        expect(isVideoRecordingSupported()).toBe(true);
    });

    it("reports unsupported when no video container is available", () => {
        FakeMediaRecorder.supported = ["audio/webm"];
        expect(pickVideoMimeType()).toBeNull();
        expect(isVideoRecordingSupported()).toBe(false);
    });

    it("honours a caller-supplied preference order", () => {
        FakeMediaRecorder.supported = ["video/webm", "video/mp4"];
        expect(pickVideoMimeType(["video/mp4", "video/webm"])).toBe("video/mp4");
    });

    it("reports unsupported with no MediaRecorder at all", () => {
        const undo = removeMediaRecorder();
        try {
            expect(isVideoRecordingSupported()).toBe(false);
        } finally {
            undo();
        }
    });

    it("carries audio in every candidate, so a screen share never loses the tab sound", () => {
        // A candidate that names a video codec must name an audio one too; the bare
        // container entries let the browser decide.
        const withCodecs = VIDEO_MIME_CANDIDATES.filter((type) => type.includes("codecs="));
        expect(withCodecs.length).toBeGreaterThan(0);
        expect(withCodecs.every((type) => /opus|mp4a/.test(type))).toBe(true);
    });
});

describe("createVideoRecorder", () => {
    let restore: () => void;

    beforeEach(() => {
        restore = installMediaRecorder();
        FakeMediaRecorder.supported = [...VIDEO_MIME_CANDIDATES];
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    });

    afterEach(() => {
        vi.useRealTimers();
        restore();
    });

    it("negotiates a video container and starts idle", () => {
        const recorder = createVideoRecorder(fakeVideoStream().stream);
        expect(recorder.mimeType).toBe("video/webm;codecs=vp9,opus");
        expect(recorder.status()).toBe("idle");
    });

    it("throws on a forced container the browser cannot produce", () => {
        expect(() =>
            createVideoRecorder(fakeVideoStream().stream, { mimeType: "video/x-matroska" }),
        ).toThrow(/cannot record "video\/x-matroska"/);
    });

    it("passes the video bitrate through", () => {
        createVideoRecorder(fakeVideoStream().stream, { videoBitsPerSecond: 2_500_000 });
        expect(latest().options.videoBitsPerSecond).toBe(2_500_000);
    });

    it("records, clocks and assembles the blob", async () => {
        const recorder = createVideoRecorder(fakeVideoStream({ audio: true }).stream);
        recorder.start();
        vi.advanceTimersByTime(2_000);

        const recording = await recorder.stop();
        expect(recording.durationMs).toBe(2_000);
        expect(recording.blob.size).toBeGreaterThan(0);
        expect(recording.blob.type).toBe("video/webm;codecs=vp9,opus");
    });

    it("forwards chunks on a timeslice, for a long capture", () => {
        const onChunk = vi.fn();
        const recorder = createVideoRecorder(fakeVideoStream().stream, {
            timesliceMs: 5_000,
            onChunk,
        });
        recorder.start();
        expect(latest().timeslice).toBe(5_000);

        latest().emit(64);
        expect(onChunk).toHaveBeenCalledTimes(1);
    });

    it("surfaces a recorder error", () => {
        const onError = vi.fn();
        const recorder = createVideoRecorder(fakeVideoStream().stream, { onError });
        recorder.start();
        latest().fireError(new Error("share revoked"));
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "share revoked" }));
    });

    it("does not stop the share — a second take must not need a new picker", async () => {
        const { stream, video } = fakeVideoStream();
        const recorder = createVideoRecorder(stream);
        recorder.start();
        await recorder.stop();
        expect(video.stopped).toBe(false);
    });
});

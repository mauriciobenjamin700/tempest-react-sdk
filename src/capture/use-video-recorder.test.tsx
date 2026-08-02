import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeMediaRecorder, fakeVideoStream, installMediaRecorder } from "../../test/audio-mocks";
import { VIDEO_MIME_CANDIDATES } from "./video-recorder";
import { useVideoRecorder, type UseVideoRecorderOptions } from "./use-video-recorder";

function Probe({ stream, ...options }: { stream: MediaStream | null } & UseVideoRecorderOptions) {
    const rec = useVideoRecorder(stream, options);
    return (
        <div>
            <span data-testid="status">{rec.status}</span>
            <span data-testid="ready">{String(rec.ready)}</span>
            <span data-testid="duration">{rec.durationMs}</span>
            <span data-testid="size">{rec.recording?.blob.size ?? ""}</span>
            <span data-testid="error">{rec.error instanceof Error ? rec.error.message : ""}</span>
            <button type="button" onClick={rec.start}>
                start
            </button>
            <button type="button" onClick={rec.pause}>
                pause
            </button>
            <button type="button" onClick={rec.resume}>
                resume
            </button>
            <button type="button" onClick={() => void rec.stop()}>
                stop
            </button>
            <button type="button" onClick={rec.cancel}>
                cancel
            </button>
        </div>
    );
}

const click = (name: string): void => {
    act(() => screen.getByRole("button", { name }).click());
};

describe("useVideoRecorder", () => {
    const restores: Array<() => void> = [];

    beforeEach(() => {
        restores.push(installMediaRecorder());
        FakeMediaRecorder.supported = [...VIDEO_MIME_CANDIDATES];
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    });

    afterEach(() => {
        vi.useRealTimers();
        while (restores.length) restores.pop()?.();
    });

    it("is not ready without a stream, so the UI can render disabled", () => {
        render(<Probe stream={null} />);
        expect(screen.getByTestId("ready")).toHaveTextContent("false");
        expect(FakeMediaRecorder.instances).toHaveLength(0);
    });

    it("becomes ready when a stream arrives", () => {
        render(<Probe stream={fakeVideoStream().stream} />);
        expect(screen.getByTestId("ready")).toHaveTextContent("true");
        expect(screen.getByTestId("status")).toHaveTextContent("idle");
    });

    it("publishes the clock on an interval while recording", () => {
        render(<Probe stream={fakeVideoStream().stream} tickMs={250} />);
        click("start");
        expect(screen.getByTestId("status")).toHaveTextContent("recording");

        act(() => {
            vi.advanceTimersByTime(1_000);
        });
        expect(screen.getByTestId("duration")).toHaveTextContent("1000");
    });

    it("freezes the clock while paused and resumes it after", () => {
        render(<Probe stream={fakeVideoStream().stream} />);
        click("start");
        act(() => {
            vi.advanceTimersByTime(1_000);
        });

        click("pause");
        expect(screen.getByTestId("status")).toHaveTextContent("paused");
        act(() => {
            vi.advanceTimersByTime(30_000);
        });
        expect(screen.getByTestId("duration")).toHaveTextContent("1000");

        click("resume");
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(screen.getByTestId("duration")).toHaveTextContent("1500");
    });

    it("publishes the recording and calls onRecorded on stop", async () => {
        const onRecorded = vi.fn();
        render(<Probe stream={fakeVideoStream().stream} onRecorded={onRecorded} />);
        click("start");
        click("stop");

        await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
        expect(onRecorded.mock.calls[0][0].mimeType).toBe("video/webm;codecs=vp9,opus");
        expect(screen.getByTestId("status")).toHaveTextContent("stopped");
        expect(screen.getByTestId("size")).not.toHaveTextContent("");
    });

    it("resolves null when stopped while idle", async () => {
        const onRecorded = vi.fn();
        render(<Probe stream={fakeVideoStream().stream} onRecorded={onRecorded} />);
        click("stop");
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("idle"));
        expect(onRecorded).not.toHaveBeenCalled();
    });

    it("does nothing at all without a recorder", async () => {
        render(<Probe stream={null} />);
        click("start");
        click("pause");
        click("resume");
        click("stop");
        click("cancel");
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("idle"));
    });

    it("stops on its own at maxDurationMs", async () => {
        const onRecorded = vi.fn();
        render(
            <Probe
                stream={fakeVideoStream().stream}
                maxDurationMs={1_000}
                onRecorded={onRecorded}
            />,
        );
        click("start");

        act(() => {
            vi.advanceTimersByTime(1_500);
        });
        await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
    });

    it("does not count paused time towards maxDurationMs", async () => {
        const onRecorded = vi.fn();
        render(
            <Probe
                stream={fakeVideoStream().stream}
                maxDurationMs={5_000}
                onRecorded={onRecorded}
            />,
        );
        click("start");
        act(() => {
            vi.advanceTimersByTime(1_000);
        });
        click("pause");
        act(() => {
            vi.advanceTimersByTime(60_000);
        });

        // A `setTimeout` armed at start() would have fired here, mid-pause.
        expect(onRecorded).not.toHaveBeenCalled();
    });

    it("throws the video away on cancel", () => {
        render(<Probe stream={fakeVideoStream().stream} />);
        click("start");
        act(() => {
            vi.advanceTimersByTime(1_000);
        });
        click("cancel");

        expect(screen.getByTestId("status")).toHaveTextContent("idle");
        expect(screen.getByTestId("duration")).toHaveTextContent("0");
        expect(screen.getByTestId("size")).toHaveTextContent("");
    });

    it("forwards chunks when a timeslice is set", () => {
        const onChunk = vi.fn();
        render(<Probe stream={fakeVideoStream().stream} timesliceMs={200} onChunk={onChunk} />);
        click("start");
        act(() => FakeMediaRecorder.instances[0].emit());
        expect(onChunk).toHaveBeenCalledTimes(1);
    });

    it("publishes a recorder error", () => {
        const onError = vi.fn();
        render(<Probe stream={fakeVideoStream().stream} onError={onError} />);
        click("start");
        act(() => FakeMediaRecorder.instances[0].fireError(new Error("encoder died")));
        expect(screen.getByTestId("error")).toHaveTextContent("encoder died");
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it("reports the construction failure instead of pretending to be ready", () => {
        FakeMediaRecorder.supported = [];
        render(<Probe stream={fakeVideoStream().stream} />);
        expect(screen.getByTestId("ready")).toHaveTextContent("false");
        expect(screen.getByTestId("error")).toHaveTextContent("cannot record any supported video");
    });

    it("rebuilds the recorder when the shared surface changes", () => {
        const view = render(<Probe stream={fakeVideoStream({ id: "a" }).stream} />);
        expect(FakeMediaRecorder.instances).toHaveLength(1);

        view.rerender(<Probe stream={fakeVideoStream({ id: "b" }).stream} />);
        // Reusing the old recorder would keep recording a window that is gone.
        expect(FakeMediaRecorder.instances).toHaveLength(2);
    });

    it("rebuilds on a bitrate change, because it is a constructor argument", () => {
        const { stream } = fakeVideoStream();
        const view = render(<Probe stream={stream} />);
        expect(FakeMediaRecorder.instances).toHaveLength(1);

        view.rerender(<Probe stream={stream} videoBitsPerSecond={1_000_000} />);
        expect(FakeMediaRecorder.instances).toHaveLength(2);
        expect(FakeMediaRecorder.instances[1].options.videoBitsPerSecond).toBe(1_000_000);
    });

    it("cancels a recording still running at unmount", () => {
        const view = render(<Probe stream={fakeVideoStream().stream} />);
        click("start");
        view.unmount();
        expect(FakeMediaRecorder.instances[0].state).toBe("inactive");
    });
});

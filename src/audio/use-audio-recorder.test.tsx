import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    FakeAudioContext,
    FakeMediaRecorder,
    fakeStream,
    installAudioContext,
    installMediaRecorder,
} from "../../test/audio-mocks";
import { useAudioRecorder, type UseAudioRecorderOptions } from "./use-audio-recorder";

function Probe({ stream, ...options }: { stream: MediaStream | null } & UseAudioRecorderOptions) {
    const rec = useAudioRecorder(stream, options);
    return (
        <div>
            <span data-testid="status">{rec.status}</span>
            <span data-testid="ready">{String(rec.ready)}</span>
            <span data-testid="duration">{rec.durationMs}</span>
            <span data-testid="level">{rec.level.toFixed(2)}</span>
            <span data-testid="size">{rec.recording?.blob.size ?? ""}</span>
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

describe("useAudioRecorder", () => {
    const restores: Array<() => void> = [];

    beforeEach(() => {
        restores.push(installMediaRecorder(), installAudioContext());
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
        render(<Probe stream={fakeStream()} />);
        expect(screen.getByTestId("ready")).toHaveTextContent("true");
        expect(screen.getByTestId("status")).toHaveTextContent("idle");
    });

    it("publishes the clock on its own tick", () => {
        render(<Probe stream={fakeStream()} tickMs={100} />);
        click("start");

        expect(screen.getByTestId("status")).toHaveTextContent("recording");
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(screen.getByTestId("duration")).toHaveTextContent("500");
    });

    it("publishes the level while recording and zeroes it when not", () => {
        render(<Probe stream={fakeStream()} />);
        FakeAudioContext.instances[0].analyser.sample = 0.4;

        click("start");
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(screen.getByTestId("level")).toHaveTextContent("0.40");

        click("pause");
        act(() => {
            vi.advanceTimersByTime(100);
        });
        // Paused is not recording: a live meter there would be lying.
        expect(screen.getByTestId("level")).toHaveTextContent("0.00");
    });

    it("skips the AudioContext when the meter is disabled", () => {
        render(<Probe stream={fakeStream()} disableLevelMeter />);
        expect(FakeAudioContext.instances).toHaveLength(0);
    });

    it("stops and publishes the recording", async () => {
        const onRecorded = vi.fn();
        render(<Probe stream={fakeStream()} onRecorded={onRecorded} />);

        click("start");
        act(() => {
            vi.advanceTimersByTime(2_000);
        });
        click("stop");

        await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
        expect(screen.getByTestId("status")).toHaveTextContent("stopped");
        expect(onRecorded.mock.calls[0][0].durationMs).toBe(2_000);
        await waitFor(() => expect(screen.getByTestId("size")).not.toHaveTextContent(""));
    });

    it("enforces maxDurationMs on the tick, not on a timeout", async () => {
        const onRecorded = vi.fn();
        render(<Probe stream={fakeStream()} maxDurationMs={1_000} onRecorded={onRecorded} />);

        click("start");
        act(() => {
            vi.advanceTimersByTime(1_100);
        });

        await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
        expect(screen.getByTestId("status")).toHaveTextContent("stopped");
    });

    it("does not let a pause count toward maxDurationMs", () => {
        const onRecorded = vi.fn();
        render(<Probe stream={fakeStream()} maxDurationMs={5_000} onRecorded={onRecorded} />);

        click("start");
        act(() => {
            vi.advanceTimersByTime(1_000);
        });
        click("pause");
        // A `setTimeout` armed at start would have fired in the middle of this.
        act(() => {
            vi.advanceTimersByTime(30_000);
        });

        expect(onRecorded).not.toHaveBeenCalled();
        expect(screen.getByTestId("status")).toHaveTextContent("paused");
    });

    it("resumes and keeps counting", () => {
        render(<Probe stream={fakeStream()} />);
        click("start");
        act(() => {
            vi.advanceTimersByTime(1_000);
        });
        click("pause");
        act(() => {
            vi.advanceTimersByTime(10_000);
        });
        click("resume");
        act(() => {
            vi.advanceTimersByTime(1_000);
        });

        expect(screen.getByTestId("status")).toHaveTextContent("recording");
        expect(screen.getByTestId("duration")).toHaveTextContent("2000");
    });

    it("drops the audio on cancel", () => {
        const onRecorded = vi.fn();
        render(<Probe stream={fakeStream()} onRecorded={onRecorded} />);

        click("start");
        act(() => {
            vi.advanceTimersByTime(1_000);
        });
        click("cancel");

        expect(onRecorded).not.toHaveBeenCalled();
        expect(screen.getByTestId("status")).toHaveTextContent("idle");
        expect(screen.getByTestId("duration")).toHaveTextContent("0");
        expect(screen.getByTestId("size")).toHaveTextContent("");
    });

    it("returns null from stop when nothing is running", async () => {
        const onRecorded = vi.fn();
        render(<Probe stream={fakeStream()} onRecorded={onRecorded} />);
        click("stop");
        await waitFor(() => expect(onRecorded).not.toHaveBeenCalled());
    });

    it("forwards chunks", () => {
        const onChunk = vi.fn();
        render(<Probe stream={fakeStream()} timesliceMs={200} onChunk={onChunk} />);
        click("start");

        act(() => FakeMediaRecorder.instances[0].emit());
        expect(onChunk).toHaveBeenCalledTimes(1);
    });

    it("surfaces a recorder error", () => {
        const onError = vi.fn();
        render(<Probe stream={fakeStream()} onError={onError} />);
        click("start");

        act(() => FakeMediaRecorder.instances[0].fireError(new Error("boom")));
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it("stays not-ready when the recorder cannot be built", () => {
        FakeMediaRecorder.supported = [];
        render(<Probe stream={fakeStream()} />);
        expect(screen.getByTestId("ready")).toHaveTextContent("false");
    });

    it("rebuilds for a new stream, so a device switch is honoured", () => {
        const view = render(<Probe stream={fakeStream(1, "a")} />);
        expect(FakeMediaRecorder.instances).toHaveLength(1);

        view.rerender(<Probe stream={fakeStream(1, "b")} />);

        // Reusing the old recorder would keep recording the microphone the user just
        // switched away from.
        expect(FakeMediaRecorder.instances).toHaveLength(2);
        expect(FakeMediaRecorder.instances[1].stream.id).toBe("b");
    });

    it("rebuilds when the container changes", () => {
        const view = render(<Probe stream={fakeStream()} />);
        view.rerender(<Probe stream={fakeStream()} mimeType="audio/webm" />);
        expect(FakeMediaRecorder.instances.at(-1)?.mimeType).toBe("audio/webm");
    });

    it("cancels an in-flight recording and closes the meter on unmount", () => {
        const view = render(<Probe stream={fakeStream()} />);
        click("start");

        view.unmount();

        expect(FakeMediaRecorder.instances[0].state).toBe("inactive");
        expect(FakeAudioContext.instances[0].closed).toBe(true);
    });
});

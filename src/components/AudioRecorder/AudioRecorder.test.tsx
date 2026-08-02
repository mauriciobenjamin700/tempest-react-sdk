import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    FakeAudioContext,
    FakeMediaRecorder,
    fakeAudioBuffer,
    installAudioContext,
    installMediaDevices,
    installMediaRecorder,
    installPermissions,
    removeMediaRecorder,
    setSecureContext,
} from "../../../test/audio-mocks";
import { findA11yViolations, formatA11yViolations } from "../../../test/a11y";
import { AudioRecorder } from "./AudioRecorder";

/** jsdom's media element throws on `play()`; the review player mounts one. */
function installMediaElement(): () => void {
    const proto = HTMLMediaElement.prototype as unknown as Record<string, unknown>;
    const previous = { play: proto.play, pause: proto.pause };
    proto.play = vi.fn(() => Promise.resolve());
    proto.pause = vi.fn();
    return () => {
        proto.play = previous.play;
        proto.pause = previous.pause;
    };
}

describe("AudioRecorder", () => {
    const restores: Array<() => void> = [];

    beforeEach(() => {
        restores.push(
            setSecureContext(true),
            installMediaRecorder(),
            installAudioContext(),
            installMediaElement(),
        );
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        while (restores.length) restores.pop()?.();
    });

    it("says so when the browser cannot record at all", () => {
        restores.push(removeMediaRecorder());
        render(<AudioRecorder />);
        expect(screen.getByText("Este navegador não grava áudio.")).toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("does not prompt on mount", () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<AudioRecorder />);

        // A prompt nobody provoked is how an app earns a permanent block.
        expect(devices.getUserMedia).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Gravar" })).toBeEnabled();
    });

    it("opens the microphone on the first press and starts recording", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<AudioRecorder />);
        await userEvent.click(screen.getByRole("button", { name: "Gravar" }));

        await waitFor(() => expect(devices.getUserMedia).toHaveBeenCalledTimes(1));
        // The press has to survive the permission round-trip, or the first click looks
        // broken.
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument(),
        );
        expect(screen.getByText("Gravando")).toBeInTheDocument();
    });

    it("shows a live level meter while recording", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        vi.useFakeTimers({ shouldAdvanceTime: true });

        try {
            render(<AudioRecorder />);
            await userEvent.click(screen.getByRole("button", { name: "Gravar" }));
            await waitFor(() => expect(screen.getByRole("meter")).toBeInTheDocument());

            FakeAudioContext.instances[0].analyser.sample = 0.5;
            act(() => {
                vi.advanceTimersByTime(150);
            });

            // A muted OS input records perfect silence; without a visible level the
            // user only finds out afterwards.
            expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "50");
        } finally {
            vi.useRealTimers();
        }
    });

    it("pauses and resumes", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<AudioRecorder />);
        await userEvent.click(screen.getByRole("button", { name: "Gravar" }));
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument(),
        );

        await userEvent.click(screen.getByRole("button", { name: "Pausar" }));
        expect(screen.getByText("Pausado")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
        expect(screen.getByText("Gravando")).toBeInTheDocument();
    });

    it("stops, hands over the recording and offers review plus retake", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const onRecorded = vi.fn();

        render(<AudioRecorder onRecorded={onRecorded} />);
        await userEvent.click(screen.getByRole("button", { name: "Gravar" }));
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument(),
        );

        await userEvent.click(screen.getByRole("button", { name: "Parar" }));

        await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
        expect(onRecorded.mock.calls[0][0].mimeType).toBe("audio/webm;codecs=opus");
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Gravar de novo" })).toBeInTheDocument(),
        );
        expect(screen.getByRole("button", { name: "Tocar" })).toBeInTheDocument();
    });

    it("skips the review player when asked", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<AudioRecorder review={false} />);
        await userEvent.click(screen.getByRole("button", { name: "Gravar" }));
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument(),
        );
        await userEvent.click(screen.getByRole("button", { name: "Parar" }));

        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Gravar de novo" })).toBeInTheDocument(),
        );
        expect(screen.queryByRole("button", { name: "Tocar" })).not.toBeInTheDocument();
    });

    it("records again from the review state", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<AudioRecorder />);
        await userEvent.click(screen.getByRole("button", { name: "Gravar" }));
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument(),
        );
        await userEvent.click(screen.getByRole("button", { name: "Parar" }));
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Gravar de novo" })).toBeInTheDocument(),
        );

        await userEvent.click(screen.getByRole("button", { name: "Gravar de novo" }));

        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument(),
        );
        // The stream is still open, so no second prompt.
        expect(devices.getUserMedia).toHaveBeenCalledTimes(1);
    });

    it("converts to WAV when asked", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        FakeAudioContext.decoded = fakeAudioBuffer([new Float32Array([0.5, 0.5])], 48000);
        const onRecorded = vi.fn();

        render(<AudioRecorder format="wav" onRecorded={onRecorded} />);
        await userEvent.click(screen.getByRole("button", { name: "Gravar" }));
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument(),
        );
        await userEvent.click(screen.getByRole("button", { name: "Parar" }));

        // `onRecorded` must only ever fire with the format the caller asked for.
        await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
        expect(onRecorded.mock.calls[0][0].mimeType).toBe("audio/wav");
        expect(onRecorded.mock.calls[0][0].blob.type).toBe("audio/wav");
    });

    it("falls back to the native container when the WAV conversion fails", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        FakeAudioContext.decodeShouldReject = true;
        const onRecorded = vi.fn();
        const onError = vi.fn();

        render(<AudioRecorder format="wav" onRecorded={onRecorded} onError={onError} />);
        await userEvent.click(screen.getByRole("button", { name: "Gravar" }));
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument(),
        );
        await userEvent.click(screen.getByRole("button", { name: "Parar" }));

        await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
        // Losing the recording because a conversion failed would be the worse outcome.
        expect(onRecorded).toHaveBeenCalledTimes(1);
        expect(onRecorded.mock.calls[0][0].mimeType).toBe("audio/webm;codecs=opus");
    });

    it("refuses to offer a button when the permission is already denied", async () => {
        const permissions = installPermissions("denied");
        restores.push(permissions.restore);
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<AudioRecorder />);

        await waitFor(() => expect(screen.getByRole("button", { name: "Gravar" })).toBeDisabled());
        expect(screen.getByText(/bloqueado/)).toBeInTheDocument();
    });

    it("shows the classified error when the microphone cannot be opened", async () => {
        const devices = installMediaDevices({
            getUserMedia: () => Promise.reject(new DOMException("busy", "NotReadableError")),
        });
        restores.push(devices.restore);

        render(<AudioRecorder />);
        await userEvent.click(screen.getByRole("button", { name: "Gravar" }));

        await waitFor(() => expect(screen.getByText(/in use by another app/)).toBeInTheDocument());
    });

    it("stops on its own at maxDurationMs and shows the cap", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const onRecorded = vi.fn();
        vi.useFakeTimers({ shouldAdvanceTime: true });

        try {
            render(<AudioRecorder maxDurationMs={1_000} onRecorded={onRecorded} />);
            await userEvent.click(screen.getByRole("button", { name: "Gravar" }));
            await waitFor(() =>
                expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument(),
            );
            expect(screen.getByText("/ 0:01")).toBeInTheDocument();

            act(() => {
                vi.advanceTimersByTime(1_200);
            });

            await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
        } finally {
            vi.useRealTimers();
        }
    });

    it("passes the device and bitrate through", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<AudioRecorder deviceId="mic-3" audioBitsPerSecond={32_000} />);
        await userEvent.click(screen.getByRole("button", { name: "Gravar" }));

        await waitFor(() => expect(devices.getUserMedia).toHaveBeenCalled());
        expect(devices.getUserMedia.mock.calls[0][0]).toMatchObject({
            audio: { deviceId: { exact: "mic-3" } },
        });
        await waitFor(() => expect(FakeMediaRecorder.instances).toHaveLength(1));
    });

    it("honours disabled and renders a footer", () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<AudioRecorder disabled footer={<span>Máx. 2 min</span>} />);

        expect(screen.getByRole("button", { name: "Gravar" })).toBeDisabled();
        expect(screen.getByText("Máx. 2 min")).toBeInTheDocument();
    });

    it("uses the en locale labels", () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<AudioRecorder locale="en" />);
        expect(screen.getByRole("button", { name: "Record" })).toBeInTheDocument();
        expect(screen.getByText("Press Record to start.")).toBeInTheDocument();
    });
});

describe("AudioRecorder accessibility", () => {
    const restores: Array<() => void> = [];

    beforeEach(() => {
        restores.push(
            setSecureContext(true),
            installMediaRecorder(),
            installAudioContext(),
            installMediaElement(),
        );
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        while (restores.length) restores.pop()?.();
    });

    /**
     * Swept here rather than in `components/a11y.test.tsx`, because the interesting
     * states need `MediaRecorder` and `getUserMedia` mocked — in the shared sweep the
     * component would only ever render its "this browser cannot record" fallback, and
     * auditing that proves nothing about the recorder.
     */
    it("has no axe violations while idle, while recording, or in review", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        const view = render(<AudioRecorder footer={<span>Máx. 2 min</span>} />);
        expect(formatA11yViolations(await findA11yViolations(view.baseElement))).toBe("");

        await userEvent.click(screen.getByRole("button", { name: "Gravar" }));
        await waitFor(() => expect(screen.getByRole("meter")).toBeInTheDocument());
        expect(formatA11yViolations(await findA11yViolations(view.baseElement))).toBe("");

        await userEvent.click(screen.getByRole("button", { name: "Parar" }));
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Gravar de novo" })).toBeInTheDocument(),
        );
        expect(formatA11yViolations(await findA11yViolations(view.baseElement))).toBe("");
    });
});

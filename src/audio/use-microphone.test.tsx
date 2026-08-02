import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    FakeStream,
    fakeStream,
    installMediaDevices,
    removeMediaDevices,
    setSecureContext,
} from "../../test/audio-mocks";
import { useMicrophone, type UseMicrophoneOptions } from "./use-microphone";

/**
 * A promise whose settlement the test controls.
 *
 * Capturing `resolve` into a `let` from inside the executor makes TypeScript narrow
 * the variable to `never` at the call site — it cannot see that the executor already
 * ran. Returning the handles from a function keeps the types honest.
 */
function deferred(): {
    promise: Promise<MediaStream>;
    resolve: (value: MediaStream) => void;
    reject: (error: unknown) => void;
} {
    let resolve!: (value: MediaStream) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<MediaStream>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function Probe(options: UseMicrophoneOptions = {}) {
    const mic = useMicrophone(options);
    return (
        <div>
            <span data-testid="status">{mic.status}</span>
            <span data-testid="error">{mic.error?.kind ?? ""}</span>
            <span data-testid="stream">{mic.stream ? "yes" : "no"}</span>
            <button type="button" onClick={mic.start}>
                start
            </button>
            <button type="button" onClick={mic.stop}>
                stop
            </button>
        </div>
    );
}

describe("useMicrophone", () => {
    const restores: Array<() => void> = [];
    afterEach(() => {
        while (restores.length) restores.pop()?.();
    });

    it("does not touch the microphone until asked", () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe />);

        // Prompting on mount is how an app earns a permanent block.
        expect(devices.getUserMedia).not.toHaveBeenCalled();
        expect(screen.getByTestId("status")).toHaveTextContent("idle");
    });

    it("opens on start and exposes the stream", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe />);
        await userEvent.click(screen.getByRole("button", { name: "start" }));

        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
        expect(screen.getByTestId("stream")).toHaveTextContent("yes");
    });

    it("opens on mount when autoStart is set", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe autoStart />);

        await waitFor(() => expect(devices.getUserMedia).toHaveBeenCalledTimes(1));
    });

    it("asks for voice processing by default", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe />);
        await userEvent.click(screen.getByRole("button", { name: "start" }));

        await waitFor(() => expect(devices.getUserMedia).toHaveBeenCalled());
        expect(devices.getUserMedia.mock.calls[0][0]).toEqual({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
        });
    });

    it("turns processing off when asked, and pins a device", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe echoCancellation={false} noiseSuppression={false} deviceId="mic-7" />);
        await userEvent.click(screen.getByRole("button", { name: "start" }));

        await waitFor(() => expect(devices.getUserMedia).toHaveBeenCalled());
        expect(devices.getUserMedia.mock.calls[0][0]).toEqual({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: true,
                deviceId: { exact: "mic-7" },
            },
            video: false,
        });
    });

    it("lets full constraints replace everything", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);
        const constraints = { audio: { sampleRate: 16000 }, video: false };

        render(<Probe constraints={constraints} />);
        await userEvent.click(screen.getByRole("button", { name: "start" }));

        await waitFor(() => expect(devices.getUserMedia).toHaveBeenCalledWith(constraints));
    });

    it("classifies a denial", async () => {
        restores.push(setSecureContext(true));
        const devices = installMediaDevices({
            getUserMedia: () => Promise.reject(new DOMException("no", "NotAllowedError")),
        });
        restores.push(devices.restore);

        render(<Probe />);
        await userEvent.click(screen.getByRole("button", { name: "start" }));

        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
        expect(screen.getByTestId("error")).toHaveTextContent("permission-denied");
    });

    it("classifies a missing API as unsupported over HTTPS", async () => {
        restores.push(setSecureContext(true));
        restores.push(removeMediaDevices());

        render(<Probe />);
        await userEvent.click(screen.getByRole("button", { name: "start" }));

        await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("unsupported"));
    });

    it("blames the insecure context when there is no API and no HTTPS", async () => {
        restores.push(setSecureContext(false));
        restores.push(removeMediaDevices());

        render(<Probe />);
        await userEvent.click(screen.getByRole("button", { name: "start" }));

        await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("insecure"));
    });

    it("stops every track on stop — dropping the reference is not enough", async () => {
        const stream = new FakeStream(2);
        const devices = installMediaDevices({
            getUserMedia: () => Promise.resolve(stream as unknown as MediaStream),
        });
        restores.push(devices.restore);

        render(<Probe />);
        await userEvent.click(screen.getByRole("button", { name: "start" }));
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));

        await userEvent.click(screen.getByRole("button", { name: "stop" }));

        // The browser's recording indicator only clears when the tracks stop.
        expect(stream.getTracks().every((track) => track.stopped)).toBe(true);
        expect(screen.getByTestId("status")).toHaveTextContent("idle");
    });

    it("stops the tracks on unmount", async () => {
        const stream = new FakeStream(1);
        const devices = installMediaDevices({
            getUserMedia: () => Promise.resolve(stream as unknown as MediaStream),
        });
        restores.push(devices.restore);

        const view = render(<Probe />);
        await userEvent.click(screen.getByRole("button", { name: "start" }));
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));

        view.unmount();
        expect(stream.getTracks()[0].stopped).toBe(true);
    });

    it("ignores a second start while a stream is open", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe />);
        await userEvent.click(screen.getByRole("button", { name: "start" }));
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));

        await userEvent.click(screen.getByRole("button", { name: "start" }));
        expect(devices.getUserMedia).toHaveBeenCalledTimes(1);
    });

    it("discards a stream that arrives after stop", async () => {
        const stream = new FakeStream(1);
        const gate = deferred();
        const devices = installMediaDevices({ getUserMedia: () => gate.promise });
        restores.push(devices.restore);

        render(<Probe />);
        await userEvent.click(screen.getByRole("button", { name: "start" }));
        await userEvent.click(screen.getByRole("button", { name: "stop" }));

        // The device opened anyway; leaving it open would keep the recording indicator
        // lit with nothing using it.
        gate.resolve(stream as unknown as MediaStream);
        await waitFor(() => expect(stream.getTracks()[0].stopped).toBe(true));
        expect(screen.getByTestId("stream")).toHaveTextContent("no");
    });

    it("swallows an error that lands after stop", async () => {
        const gate = deferred();
        const devices = installMediaDevices({ getUserMedia: () => gate.promise });
        restores.push(devices.restore);

        render(<Probe />);
        await userEvent.click(screen.getByRole("button", { name: "start" }));
        await userEvent.click(screen.getByRole("button", { name: "stop" }));

        gate.reject(new DOMException("no", "NotAllowedError"));
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("idle"));
        expect(screen.getByTestId("error")).toHaveTextContent("");
    });

    it("keeps the requesting status while the prompt is open", async () => {
        const devices = installMediaDevices({
            getUserMedia: () => new Promise<MediaStream>(() => undefined),
        });
        restores.push(devices.restore);

        render(<Probe />);
        await userEvent.click(screen.getByRole("button", { name: "start" }));

        expect(screen.getByTestId("status")).toHaveTextContent("requesting");
    });

    it("hands out the same stream object it received", async () => {
        const stream = fakeStream(1, "the-stream");
        const devices = installMediaDevices({ getUserMedia: () => Promise.resolve(stream) });
        restores.push(devices.restore);

        const seen = vi.fn();
        function Capture() {
            const mic = useMicrophone({ autoStart: true });
            if (mic.stream) seen(mic.stream);
            return null;
        }
        render(<Capture />);

        await waitFor(() => expect(seen).toHaveBeenCalledWith(stream));
    });
});

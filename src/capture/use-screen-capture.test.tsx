import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    type FakeTrack,
    fakeVideoStream,
    installMediaDevices,
    removeMediaDevices,
    setSecureContext,
} from "../../test/audio-mocks";
import {
    isScreenCaptureSupported,
    useScreenCapture,
    type UseScreenCaptureOptions,
} from "./use-screen-capture";

function Probe(options: UseScreenCaptureOptions) {
    const capture = useScreenCapture(options);
    return (
        <div>
            <span data-testid="status">{capture.status}</span>
            <span data-testid="supported">{String(capture.supported)}</span>
            <span data-testid="surface">{capture.surface ?? ""}</span>
            <span data-testid="audio">{String(capture.hasAudio)}</span>
            <span data-testid="error">{capture.error?.kind ?? ""}</span>
            <span data-testid="message">{capture.error?.message ?? ""}</span>
            <span data-testid="stream">{capture.stream ? "live" : ""}</span>
            <button type="button" onClick={capture.start}>
                start
            </button>
            <button type="button" onClick={capture.stop}>
                stop
            </button>
        </div>
    );
}

const click = (name: string): void => {
    act(() => screen.getByRole("button", { name }).click());
};

describe("useScreenCapture", () => {
    const restores: Array<() => void> = [];

    beforeEach(() => {
        restores.push(setSecureContext(true));
    });

    afterEach(() => {
        while (restores.length) restores.pop()?.();
    });

    it("reports unsupported where getDisplayMedia does not exist", () => {
        restores.push(removeMediaDevices());
        render(<Probe />);
        expect(screen.getByTestId("supported")).toHaveTextContent("false");
        expect(isScreenCaptureSupported()).toBe(false);
    });

    it("reports the missing API as an error rather than doing nothing on press", async () => {
        const devices = installMediaDevices({ withoutDisplayMedia: true });
        restores.push(devices.restore);

        render(<Probe />);
        click("start");

        await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("unsupported"));
        expect(screen.getByTestId("message")).toHaveTextContent("Screen capture is not supported");
    });

    it("prefers the insecure-context explanation, because the fix is a URL", async () => {
        restores.push(setSecureContext(false));
        const devices = installMediaDevices({ withoutDisplayMedia: true });
        restores.push(devices.restore);

        render(<Probe />);
        click("start");

        await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("insecure"));
    });

    it("does not open the picker on mount", () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe />);
        expect(devices.getDisplayMedia).not.toHaveBeenCalled();
        expect(screen.getByTestId("status")).toHaveTextContent("idle");
    });

    it("shares, reports the picked surface and whether audio came along", async () => {
        const { stream } = fakeVideoStream({
            audio: true,
            settings: { displaySurface: "browser" },
        });
        const devices = installMediaDevices({ getDisplayMedia: () => Promise.resolve(stream) });
        restores.push(devices.restore);

        render(<Probe audio />);
        click("start");

        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("sharing"));
        expect(screen.getByTestId("surface")).toHaveTextContent("browser");
        expect(screen.getByTestId("audio")).toHaveTextContent("true");
        expect(screen.getByTestId("stream")).toHaveTextContent("live");
    });

    it("reports no audio when the browser gave none, whatever was asked for", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe audio />);
        click("start");

        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("sharing"));
        // Chromium only offers display audio for a tab; asking is not getting.
        expect(screen.getByTestId("audio")).toHaveTextContent("false");
    });

    it("passes the surface hints through", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(
            <Probe
                displaySurface="browser"
                preferCurrentTab
                selfBrowserSurface="exclude"
                surfaceSwitching="include"
                systemAudio="exclude"
            />,
        );
        click("start");

        await waitFor(() => expect(devices.getDisplayMedia).toHaveBeenCalledTimes(1));
        expect(devices.getDisplayMedia.mock.calls[0][0]).toMatchObject({
            video: { displaySurface: "browser" },
            preferCurrentTab: true,
            selfBrowserSurface: "exclude",
            surfaceSwitching: "include",
            systemAudio: "exclude",
        });
    });

    it("lets full options replace everything", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe options={{ video: { frameRate: 5 } }} displaySurface="monitor" />);
        click("start");

        await waitFor(() => expect(devices.getDisplayMedia).toHaveBeenCalledTimes(1));
        expect(devices.getDisplayMedia.mock.calls[0][0]).toEqual({ video: { frameRate: 5 } });
    });

    it("treats a dismissed picker as a cancellation, not an error", async () => {
        const devices = installMediaDevices({
            getDisplayMedia: () => Promise.reject(new DOMException("no", "NotAllowedError")),
        });
        restores.push(devices.restore);
        const onCancelled = vi.fn();

        render(<Probe onCancelled={onCancelled} />);
        click("start");

        await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
        // A red toast for "changed my mind" punishes the user for using the picker.
        expect(screen.getByTestId("error")).toHaveTextContent("");
        expect(screen.getByTestId("status")).toHaveTextContent("idle");
        expect(onCancelled.mock.calls[0][0]).toBeInstanceOf(DOMException);
    });

    it("treats an AbortError the same way, since some builds report that instead", async () => {
        const devices = installMediaDevices({
            getDisplayMedia: () => Promise.reject(new DOMException("gone", "AbortError")),
        });
        restores.push(devices.restore);

        render(<Probe />);
        click("start");

        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("idle"));
        expect(screen.getByTestId("error")).toHaveTextContent("");
    });

    it("classifies a real failure through the shared taxonomy", async () => {
        const devices = installMediaDevices({
            getDisplayMedia: () => Promise.reject(new DOMException("busy", "NotReadableError")),
        });
        restores.push(devices.restore);

        render(<Probe />);
        click("start");

        await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("in-use"));
        expect(screen.getByTestId("status")).toHaveTextContent("error");
    });

    it("clears the share when the user stops it from the browser bar", async () => {
        let track: FakeTrack | undefined;
        const devices = installMediaDevices({
            getDisplayMedia: () => {
                const made = fakeVideoStream();
                track = made.video;
                return Promise.resolve(made.stream);
            },
        });
        restores.push(devices.restore);
        const onEnded = vi.fn();

        render(<Probe onEnded={onEnded} />);
        click("start");
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("sharing"));

        // The `ended` event is the only signal there is — nothing in the app was clicked.
        act(() => track?.fireEnded());

        await waitFor(() => expect(onEnded).toHaveBeenCalledTimes(1));
        expect(screen.getByTestId("status")).toHaveTextContent("idle");
        expect(screen.getByTestId("stream")).toHaveTextContent("");
        expect(screen.getByTestId("surface")).toHaveTextContent("");
    });

    it("releases every track on stop, and fires nothing", async () => {
        const made = fakeVideoStream({ audio: true });
        const devices = installMediaDevices({
            getDisplayMedia: () => Promise.resolve(made.stream),
        });
        restores.push(devices.restore);
        const onEnded = vi.fn();

        render(<Probe onEnded={onEnded} />);
        click("start");
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("sharing"));

        click("stop");

        const stopped = made.stream
            .getTracks()
            .every((track) => (track as unknown as { stopped: boolean }).stopped);
        expect(stopped).toBe(true);
        expect(onEnded).not.toHaveBeenCalled();
        expect(screen.getByTestId("status")).toHaveTextContent("idle");
    });

    it("ignores a second start while already sharing", async () => {
        const devices = installMediaDevices({});
        restores.push(devices.restore);

        render(<Probe />);
        click("start");
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("sharing"));

        click("start");
        expect(devices.getDisplayMedia).toHaveBeenCalledTimes(1);
    });

    it("drops a stream that arrives after stop, instead of leaking the share", async () => {
        let resolveStream: ((stream: MediaStream) => void) | undefined;
        const made = fakeVideoStream();
        const devices = installMediaDevices({
            getDisplayMedia: () =>
                new Promise<MediaStream>((resolve) => {
                    resolveStream = resolve;
                }),
        });
        restores.push(devices.restore);

        render(<Probe />);
        click("start");
        click("stop");
        await act(async () => {
            resolveStream?.(made.stream);
        });

        expect(made.video.stopped).toBe(true);
        expect(screen.getByTestId("status")).toHaveTextContent("idle");
    });

    it("ignores a rejection that lands after stop", async () => {
        let rejectRequest: ((reason: unknown) => void) | undefined;
        const devices = installMediaDevices({
            getDisplayMedia: () =>
                new Promise<MediaStream>((_resolve, reject) => {
                    rejectRequest = reject;
                }),
        });
        restores.push(devices.restore);
        const onCancelled = vi.fn();

        render(<Probe onCancelled={onCancelled} />);
        click("start");
        click("stop");
        await act(async () => {
            rejectRequest?.(new DOMException("no", "NotAllowedError"));
        });

        expect(onCancelled).not.toHaveBeenCalled();
        expect(screen.getByTestId("error")).toHaveTextContent("");
    });

    it("releases the share at unmount", async () => {
        const made = fakeVideoStream();
        const devices = installMediaDevices({
            getDisplayMedia: () => Promise.resolve(made.stream),
        });
        restores.push(devices.restore);

        const view = render(<Probe />);
        click("start");
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("sharing"));

        view.unmount();
        expect(made.video.stopped).toBe(true);
    });
});

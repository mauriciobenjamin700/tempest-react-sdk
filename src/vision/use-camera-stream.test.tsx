import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    useCameraStream,
    type CameraStreamStatus,
    type CameraStreamError,
    type UseCameraStreamApi,
} from "./use-camera-stream";

interface Observed {
    status: CameraStreamStatus;
    error: CameraStreamError | null;
    retry: () => void;
    video: HTMLVideoElement | null;
}

let observed: Observed;

function Harness(): React.JSX.Element {
    const api: UseCameraStreamApi = useCameraStream();
    observed = {
        status: api.status,
        error: api.error,
        retry: api.retry,
        video: api.videoRef.current,
    };
    return <video ref={api.videoRef} data-testid="cam" />;
}

function makeFakeStream(): { stream: MediaStream; stop: ReturnType<typeof vi.fn> } {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    return { stream, stop };
}

function setMediaDevices(getUserMedia: unknown): void {
    Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia },
    });
}

describe("useCameraStream", () => {
    beforeEach(() => {
        Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
        vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (navigator as { mediaDevices?: unknown }).mediaDevices;
    });

    it("reports an unsupported error when getUserMedia is missing", async () => {
        delete (navigator as { mediaDevices?: unknown }).mediaDevices;
        render(<Harness />);
        await waitFor(() => expect(observed.status).toBe("error"));
        expect(observed.error?.kind).toBe("unsupported");
    });

    it("becomes ready and attaches the stream on success", async () => {
        const { stream } = makeFakeStream();
        const getUserMedia = vi.fn().mockResolvedValue(stream);
        setMediaDevices(getUserMedia);

        render(<Harness />);
        await waitFor(() => expect(observed.status).toBe("ready"));
        expect(getUserMedia).toHaveBeenCalledTimes(1);
        expect(observed.error).toBeNull();
        expect(observed.video?.srcObject).toBe(stream);
    });

    it("re-runs getUserMedia when retry() is called", async () => {
        const first = makeFakeStream();
        const second = makeFakeStream();
        const getUserMedia = vi
            .fn()
            .mockResolvedValueOnce(first.stream)
            .mockResolvedValueOnce(second.stream);
        setMediaDevices(getUserMedia);

        render(<Harness />);
        await waitFor(() => expect(observed.status).toBe("ready"));

        observed.retry();
        await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
        // The previous stream's tracks are stopped before the new attach.
        expect(first.stop).toHaveBeenCalled();
    });

    it("stops tracks on unmount", async () => {
        const { stream, stop } = makeFakeStream();
        setMediaDevices(vi.fn().mockResolvedValue(stream));

        const { unmount } = render(<Harness />);
        await waitFor(() => expect(observed.status).toBe("ready"));
        unmount();
        expect(stop).toHaveBeenCalled();
    });
});

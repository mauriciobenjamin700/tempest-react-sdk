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

describe("useCameraStream — error classification", () => {
    beforeEach(() => {
        Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
        vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (navigator as { mediaDevices?: unknown }).mediaDevices;
    });

    it.each([
        ["NotAllowedError", "permission-denied"],
        ["SecurityError", "permission-denied"],
        ["NotFoundError", "no-camera"],
        ["OverconstrainedError", "no-camera"],
        ["NotReadableError", "in-use"],
        ["AbortError", "in-use"],
        ["WeirdError", "unknown"],
    ])("maps DOMException %s to kind %s", async (name, kind) => {
        setMediaDevices(vi.fn().mockRejectedValue(new DOMException("nope", name)));
        render(<Harness />);
        await waitFor(() => expect(observed.status).toBe("error"));
        expect(observed.error?.kind).toBe(kind);
    });

    it("surfaces the message of a plain Error", async () => {
        setMediaDevices(vi.fn().mockRejectedValue(new Error("boom")));
        render(<Harness />);
        await waitFor(() => expect(observed.status).toBe("error"));
        expect(observed.error).toEqual({ kind: "unknown", message: "boom" });
    });

    it("falls back to a generic message for a non-Error rejection", async () => {
        setMediaDevices(vi.fn().mockRejectedValue("nope"));
        render(<Harness />);
        await waitFor(() => expect(observed.status).toBe("error"));
        expect(observed.error?.message).toMatch(/Unexpected error/);
    });

    it("prefers the insecure-context error over any DOMException name", async () => {
        Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
        setMediaDevices(vi.fn().mockRejectedValue(new DOMException("nope", "NotAllowedError")));
        render(<Harness />);
        await waitFor(() => expect(observed.status).toBe("error"));
        expect(observed.error?.kind).toBe("insecure");
    });

    it("blames the insecure context when getUserMedia is missing on http", async () => {
        Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
        delete (navigator as { mediaDevices?: unknown }).mediaDevices;
        render(<Harness />);
        await waitFor(() => expect(observed.status).toBe("error"));
        expect(observed.error?.kind).toBe("insecure");
    });

    it("treats a mediaDevices object without getUserMedia as unsupported", async () => {
        setMediaDevices(undefined);
        render(<Harness />);
        await waitFor(() => expect(observed.status).toBe("error"));
        expect(observed.error?.kind).toBe("unsupported");
    });
});

describe("useCameraStream — lifecycle races", () => {
    beforeEach(() => {
        Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (navigator as { mediaDevices?: unknown }).mediaDevices;
    });

    it("stops the stream when it arrives after unmount", async () => {
        vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
        const { stream, stop } = makeFakeStream();
        let release: (value: MediaStream) => void = () => undefined;
        setMediaDevices(vi.fn(() => new Promise<MediaStream>((resolve) => (release = resolve))));

        const { unmount } = render(<Harness />);
        unmount();
        release(stream);
        await waitFor(() => expect(stop).toHaveBeenCalled());
    });

    it("stays ready when video.play() rejects (blocked autoplay)", async () => {
        vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
            new DOMException("blocked", "NotAllowedError"),
        );
        const { stream } = makeFakeStream();
        setMediaDevices(vi.fn().mockResolvedValue(stream));

        render(<Harness />);
        await waitFor(() => expect(observed.status).toBe("ready"));
        expect(observed.error).toBeNull();
    });

    it("detaches the stream from the video element on unmount", async () => {
        vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
        const { stream } = makeFakeStream();
        setMediaDevices(vi.fn().mockResolvedValue(stream));

        const { unmount } = render(<Harness />);
        await waitFor(() => expect(observed.status).toBe("ready"));
        const video = observed.video as HTMLVideoElement;
        unmount();
        expect(video.srcObject).toBeNull();
    });

    it("passes custom constraints through and re-reads them on retry", async () => {
        vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
        const { stream } = makeFakeStream();
        const getUserMedia = vi.fn().mockResolvedValue(stream);
        setMediaDevices(getUserMedia);

        function CustomHarness(): React.JSX.Element {
            const api = useCameraStream({ constraints: { video: { facingMode: "user" } } });
            observed = {
                status: api.status,
                error: api.error,
                retry: api.retry,
                video: api.videoRef.current,
            };
            return <video ref={api.videoRef} />;
        }

        render(<CustomHarness />);
        await waitFor(() => expect(observed.status).toBe("ready"));
        expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "user" } });
    });

    it("stops the stream when no video element is mounted", async () => {
        const { stream, stop } = makeFakeStream();
        setMediaDevices(vi.fn().mockResolvedValue(stream));

        function NoVideo(): React.JSX.Element {
            const api = useCameraStream();
            observed = {
                status: api.status,
                error: api.error,
                retry: api.retry,
                video: api.videoRef.current,
            };
            return <div />;
        }

        render(<NoVideo />);
        await waitFor(() => expect(stop).toHaveBeenCalled());
        expect(observed.status).toBe("loading");
    });
});

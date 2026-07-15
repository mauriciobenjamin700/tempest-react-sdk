import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./luminance", () => ({
    computeImageLuminance: vi.fn(() => 123),
}));

import { computeImageLuminance } from "./luminance";
import { useLiveLuminance } from "./use-live-luminance";

let observed = 0;
let rafCb: FrameRequestCallback | null = null;

function makeVideo(readyState: number, videoWidth: number): HTMLVideoElement {
    return { readyState, videoWidth, videoHeight: videoWidth } as unknown as HTMLVideoElement;
}

function Harness({ video, enabled }: { video: HTMLVideoElement; enabled: boolean }): null {
    const ref = useRef<HTMLVideoElement | null>(video);
    ref.current = video;
    observed = useLiveLuminance(ref, { enabled, intervalMs: 100 });
    return null;
}

describe("useLiveLuminance", () => {
    beforeEach(() => {
        observed = 0;
        rafCb = null;
        vi.mocked(computeImageLuminance).mockClear();
        vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
            rafCb = cb;
            return 1;
        });
        vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("stays 0 and never schedules a frame when disabled", () => {
        render(<Harness video={makeVideo(2, 10)} enabled={false} />);
        expect(observed).toBe(0);
        expect(rafCb).toBeNull();
    });

    it("stays 0 while the video is not ready", () => {
        render(<Harness video={makeVideo(1, 0)} enabled />);
        act(() => rafCb?.(1000));
        expect(observed).toBe(0);
        expect(computeImageLuminance).not.toHaveBeenCalled();
    });

    it("samples and returns the measured luminance once the video is ready", () => {
        const video = makeVideo(2, 10);
        render(<Harness video={video} enabled />);
        act(() => rafCb?.(1000));
        expect(computeImageLuminance).toHaveBeenCalledWith(video, expect.anything());
        expect(observed).toBe(123);
    });
});

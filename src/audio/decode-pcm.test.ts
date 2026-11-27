import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeAudioToPcm, framePcm } from "./decode-pcm";

/**
 * Install an `OfflineAudioContext` whose decode returns the given channels.
 *
 * @param channels Decoded channels.
 * @param rate Rate the fake decoder reports.
 * @returns The constructor spy, to assert the decode rate.
 */
function fakeOffline(channels: Float32Array[], rate: number) {
    const ctor = vi.fn();
    class FakeOffline {
        constructor(...args: unknown[]) {
            ctor(...args);
        }
        decodeAudioData = async (bytes: ArrayBuffer) => {
            ctor("bytes", bytes.byteLength);
            return {
                numberOfChannels: channels.length,
                length: channels[0]?.length ?? 0,
                sampleRate: rate,
                getChannelData: (i: number) => channels[i] as Float32Array,
            };
        };
    }
    vi.stubGlobal("OfflineAudioContext", FakeOffline);
    return ctor;
}

const tone = (hz: number, n: number, rate: number): Float32Array =>
    Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / rate));

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("decodeAudioToPcm", () => {
    it("decodes at 48 kHz and resamples to the requested rate with its own filter", async () => {
        const ctor = fakeOffline([tone(1000, 48_000, 48_000)], 48_000);
        const pcm = await decodeAudioToPcm(new Blob([new Uint8Array(10)]), { sampleRate: 16_000 });
        expect(ctor).toHaveBeenCalledWith(1, 1, 48_000);
        expect(pcm.sampleRate).toBe(16_000);
        expect(pcm.samples).toHaveLength(16_000);
        const ideal = tone(1000, 16_000, 16_000);
        expect(Math.abs((pcm.samples[8000] as number) - (ideal[8000] as number))).toBeLessThan(
            1e-3,
        );
    });

    it("averages the channels of a stereo recording", async () => {
        fakeOffline([new Float32Array([1, 1]), new Float32Array([0, -1])], 16_000);
        const pcm = await decodeAudioToPcm(new ArrayBuffer(4), { sampleRate: 16_000 });
        expect(Array.from(pcm.samples)).toEqual([0.5, 0]);
    });

    it("decodes a copy of an ArrayBuffer, leaving the caller's intact", async () => {
        fakeOffline([new Float32Array(4)], 16_000);
        const bytes = new ArrayBuffer(8);
        await decodeAudioToPcm(bytes);
        expect(bytes.byteLength).toBe(8);
    });

    it("rejects with the abort reason before decoding", async () => {
        const ctor = fakeOffline([new Float32Array(4)], 16_000);
        const controller = new AbortController();
        controller.abort(new Error("cancelled"));
        await expect(
            decodeAudioToPcm(new ArrayBuffer(4), { signal: controller.signal }),
        ).rejects.toThrow("cancelled");
        expect(ctor).not.toHaveBeenCalled();
    });

    it("says so when Web Audio is missing", async () => {
        vi.stubGlobal("OfflineAudioContext", undefined);
        await expect(decodeAudioToPcm(new ArrayBuffer(4))).rejects.toThrow(/Web Audio/);
    });
});

describe("framePcm", () => {
    it("pads the last frame so every frame has the model's shape", () => {
        const frames = framePcm(
            Float32Array.from({ length: 1100 }, (_, i) => i + 1),
            512,
        );
        expect(frames.map((f) => f.length)).toEqual([512, 512, 512]);
        expect(frames[2]?.[75]).toBe(1100);
        expect(frames[2]?.[76]).toBe(0);
    });

    it("overlaps frames by hop", () => {
        const frames = framePcm(
            Float32Array.from({ length: 8 }, (_, i) => i),
            4,
            2,
        );
        expect(frames.map((f) => Array.from(f))).toEqual([
            [0, 1, 2, 3],
            [2, 3, 4, 5],
            [4, 5, 6, 7],
        ]);
    });

    it("returns no frame for an empty signal and one padded frame for a short one", () => {
        expect(framePcm(new Float32Array(0), 512)).toHaveLength(0);
        expect(framePcm(new Float32Array(3), 512)).toHaveLength(1);
    });

    it("refuses sizes that are not positive integers", () => {
        expect(() => framePcm(new Float32Array(4), 0)).toThrow(RangeError);
        expect(() => framePcm(new Float32Array(4), 4, 1.5)).toThrow(RangeError);
    });
});

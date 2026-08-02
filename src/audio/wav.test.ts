import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    FakeAudioContext,
    fakeAudioBuffer,
    installAudioContext,
    removeAudioContext,
} from "../../test/audio-mocks";
import { blobToWav, encodeWav } from "./wav";

/** Read a WAV blob back as a DataView, so the header can be asserted byte by byte. */
async function header(blob: Blob): Promise<DataView> {
    return new DataView(await blob.arrayBuffer());
}

const ascii = (view: DataView, offset: number, length: number): string =>
    Array.from({ length }, (_, index) => String.fromCharCode(view.getUint8(offset + index))).join(
        "",
    );

describe("encodeWav", () => {
    it("writes the canonical 44-byte RIFF/WAVE header", async () => {
        const blob = encodeWav({ channels: [new Float32Array(4)], sampleRate: 48000 });
        const view = await header(blob);

        expect(blob.type).toBe("audio/wav");
        expect(ascii(view, 0, 4)).toBe("RIFF");
        expect(ascii(view, 8, 4)).toBe("WAVE");
        expect(ascii(view, 12, 4)).toBe("fmt ");
        expect(ascii(view, 36, 4)).toBe("data");
        expect(view.getUint32(16, true)).toBe(16); // fmt chunk size
        expect(view.getUint16(20, true)).toBe(1); // format 1 = uncompressed PCM
        expect(view.getUint16(34, true)).toBe(16); // bits per sample
    });

    it("declares channel count, rate, byte rate and block align consistently", async () => {
        const blob = encodeWav({
            channels: [new Float32Array(8), new Float32Array(8)],
            sampleRate: 16000,
        });
        const view = await header(blob);

        expect(view.getUint16(22, true)).toBe(2); // channels
        expect(view.getUint32(24, true)).toBe(16000); // sample rate
        expect(view.getUint32(28, true)).toBe(16000 * 2 * 2); // byte rate
        expect(view.getUint16(32, true)).toBe(2 * 2); // block align
        expect(view.getUint32(40, true)).toBe(8 * 2 * 2); // data size
        expect(view.getUint32(4, true)).toBe(36 + 8 * 2 * 2); // RIFF size
    });

    it("interleaves channels frame by frame", async () => {
        const left = new Float32Array([1, 1]);
        const right = new Float32Array([-1, -1]);
        const view = await header(encodeWav({ channels: [left, right], sampleRate: 8000 }));

        expect(view.getInt16(44, true)).toBe(32767);
        expect(view.getInt16(46, true)).toBe(-32768);
        expect(view.getInt16(48, true)).toBe(32767);
        expect(view.getInt16(50, true)).toBe(-32768);
    });

    it("clamps out-of-range samples instead of letting them wrap", async () => {
        // Without the clamp, 1.5 truncates past 32767 and wraps negative — a loud
        // passage turns into a burst of noise.
        const view = await header(
            encodeWav({ channels: [new Float32Array([1.5, -1.5])], sampleRate: 8000 }),
        );
        expect(view.getInt16(44, true)).toBe(32767);
        expect(view.getInt16(46, true)).toBe(-32768);
    });

    it("handles an empty channel list", async () => {
        const view = await header(encodeWav({ channels: [], sampleRate: 8000 }));
        expect(view.getUint16(22, true)).toBe(1);
        expect(view.getUint32(40, true)).toBe(0);
    });
});

describe("blobToWav", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installAudioContext();
    });
    afterEach(() => restore());

    it("decodes then re-encodes, keeping both channels", async () => {
        FakeAudioContext.decoded = fakeAudioBuffer(
            [new Float32Array([1, 0]), new Float32Array([-1, 0])],
            48000,
        );

        const wav = await blobToWav(new Blob([new Uint8Array(4)]));
        const view = await header(wav);

        expect(wav.type).toBe("audio/wav");
        expect(view.getUint16(22, true)).toBe(2);
        expect(view.getUint32(24, true)).toBe(48000);
    });

    it("mixes down to one channel on request", async () => {
        FakeAudioContext.decoded = fakeAudioBuffer(
            [new Float32Array([1, 1]), new Float32Array([0, 0])],
            48000,
        );

        const view = await header(await blobToWav(new Blob([new Uint8Array(4)]), { mono: true }));

        expect(view.getUint16(22, true)).toBe(1);
        // Average of 1 and 0.
        expect(view.getInt16(44, true)).toBe(Math.trunc(0.5 * 32767));
    });

    it("mono on an already-mono source does not halve the samples", async () => {
        FakeAudioContext.decoded = fakeAudioBuffer([new Float32Array([1, 1])], 48000);
        const view = await header(await blobToWav(new Blob([new Uint8Array(4)]), { mono: true }));
        expect(view.getInt16(44, true)).toBe(32767);
    });

    it("closes the context even when decoding fails", async () => {
        FakeAudioContext.decodeShouldReject = true;

        await expect(blobToWav(new Blob([new Uint8Array(4)]))).rejects.toThrow(/cannot decode/);
        expect(FakeAudioContext.instances[0].closed).toBe(true);
    });

    it("refuses without Web Audio", async () => {
        const undo = removeAudioContext();
        try {
            await expect(blobToWav(new Blob([new Uint8Array(4)]))).rejects.toThrow(
                /Web Audio is not available/,
            );
        } finally {
            undo();
        }
    });

    it("needs OfflineAudioContext to resample", async () => {
        FakeAudioContext.decoded = fakeAudioBuffer([new Float32Array([1, 1])], 48000);
        const previous = (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext;
        delete (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext;
        try {
            await expect(
                blobToWav(new Blob([new Uint8Array(4)]), { sampleRate: 16000 }),
            ).rejects.toThrow(/OfflineAudioContext/);
        } finally {
            (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext = previous;
        }
    });

    it("resamples through the browser's own resampler", async () => {
        FakeAudioContext.decoded = fakeAudioBuffer(new Array(1).fill(new Float32Array(480)), 48000);

        class FakeOffline {
            static last: FakeOffline | null = null;
            channels: number;
            frames: number;
            rate: number;
            destination = {};
            constructor(channels: number, frames: number, rate: number) {
                this.channels = channels;
                this.frames = frames;
                this.rate = rate;
                FakeOffline.last = this;
            }
            createBufferSource(): { buffer: unknown; connect: () => void; start: () => void } {
                return { buffer: null, connect: () => undefined, start: () => undefined };
            }
            async startRendering(): Promise<AudioBuffer> {
                return fakeAudioBuffer([new Float32Array(160)], this.rate);
            }
        }

        const previous = (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext;
        (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext = FakeOffline;
        try {
            const view = await header(
                await blobToWav(new Blob([new Uint8Array(4)]), { sampleRate: 16000, mono: true }),
            );
            expect(view.getUint32(24, true)).toBe(16000);
            expect(FakeOffline.last?.rate).toBe(16000);
            expect(FakeOffline.last?.channels).toBe(1);
        } finally {
            (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext = previous;
        }
    });
});

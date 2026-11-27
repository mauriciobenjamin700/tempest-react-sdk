/**
 * Pinned against `scripts/gen-log-mel-fixture.py`, a numpy port of Whisper's front end.
 *
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { WHISPER_LOG_MEL_128, WHISPER_LOG_MEL_80, logMelSpectrogram } from "./log-mel";

/**
 * Read a little-endian float32 fixture written by `scripts/gen-log-mel-fixture.py`.
 *
 * @param name File in `__fixtures__/`.
 * @returns The values.
 */
function fixture(name: string): Float32Array {
    const bytes = readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));
    return new Float32Array(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
}

describe("logMelSpectrogram", () => {
    it("matches whisper.audio.log_mel_spectrogram on the reference signal", () => {
        const input = fixture("log-mel-input.f32");
        const expected = fixture("log-mel-whisper80.f32");
        const mel = logMelSpectrogram(input, WHISPER_LOG_MEL_80);
        expect(mel.nMels).toBe(80);
        expect(mel.frames).toBe(200);
        let worst = 0;
        for (let i = 0; i < expected.length; i += 1) {
            worst = Math.max(worst, Math.abs((mel.data[i] as number) - (expected[i] as number)));
        }
        expect(worst).toBeLessThan(1e-6);
    });

    it("gives Whisper's 3000 frames for 30 s", () => {
        const mel = logMelSpectrogram(new Float32Array(480_000), WHISPER_LOG_MEL_80);
        expect(mel.frames).toBe(3000);
        expect(mel.data.length).toBe(80 * 3000);
    });

    it("keeps the large-v3 front end identical but for the band count", () => {
        expect(WHISPER_LOG_MEL_128).toEqual({ ...WHISPER_LOG_MEL_80, nMels: 128 });
        expect(logMelSpectrogram(new Float32Array(16_000), WHISPER_LOG_MEL_128).nMels).toBe(128);
    });

    it("floors silence at max - 8 so the scale is relative to the loudest bin", () => {
        const signal = new Float32Array(16_000);
        for (let i = 0; i < 8000; i += 1) signal[i] = Math.sin((2 * Math.PI * 440 * i) / 16_000);
        const mel = logMelSpectrogram(signal, WHISPER_LOG_MEL_80);
        const max = Math.max(...mel.data);
        expect(Math.min(...mel.data)).toBeCloseTo(max - 2, 5);
    });

    it("applies a natural-log scaling with an offset", () => {
        const mel = logMelSpectrogram(new Float32Array(1024), {
            sampleRate: 16_000,
            nFft: 512,
            hopLength: 160,
            nMels: 64,
            center: false,
            scaling: { log: "natural", offset: 0.001 },
        });
        expect(mel.frames).toBe(4);
        expect(mel.data.every((v) => Math.abs(v - Math.log(0.001)) < 1e-6)).toBe(true);
    });

    it("runs prime and odd FFT sizes through the direct DFT", () => {
        const mel = logMelSpectrogram(new Float32Array(400).fill(0.1), {
            sampleRate: 16_000,
            nFft: 7,
            hopLength: 7,
            nMels: 2,
            center: false,
            scaling: { log: "natural", offset: 1 },
        });
        expect(mel.frames).toBe(57);
        expect(Number.isFinite(mel.data[0] as number)).toBe(true);
    });

    it("refuses input shorter than the centre padding", () => {
        expect(() => logMelSpectrogram(new Float32Array(10), WHISPER_LOG_MEL_80)).toThrow(
            RangeError,
        );
    });
});

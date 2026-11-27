import { describe, expect, it } from "vitest";

import { createSincResampler, resamplePcm } from "./resample";

/**
 * A sine at `hz`, amplitude 0.5.
 *
 * @param hz Frequency.
 * @param seconds Duration.
 * @param rate Sample rate.
 * @returns The samples.
 */
function tone(hz: number, seconds: number, rate: number): Float32Array {
    const out = new Float32Array(Math.round(seconds * rate));
    for (let i = 0; i < out.length; i += 1) out[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / rate);
    return out;
}

/**
 * RMS of the middle of a signal, skipping the edges where the filter ramps.
 *
 * @param samples The signal.
 * @returns The RMS.
 */
function middleRms(samples: Float32Array): number {
    const cut = Math.floor(samples.length * 0.1);
    const body = samples.subarray(cut, samples.length - cut);
    let sum = 0;
    for (const x of body) sum += x * x;
    return Math.sqrt(sum / body.length);
}

const IN_RMS = 0.5 / Math.SQRT2;
const db = (rms: number): number => 20 * Math.log10(rms / IN_RMS);

describe("resamplePcm", () => {
    it("keeps a 7 kHz tone within 0.1 dB when going from 48 kHz to 16 kHz", () => {
        expect(
            Math.abs(db(middleRms(resamplePcm(tone(7000, 1, 48_000), 48_000, 16_000)))),
        ).toBeLessThan(0.1);
    });

    it("pushes a 9 kHz tone, above the new Nyquist, below -70 dB", () => {
        expect(db(middleRms(resamplePcm(tone(9000, 1, 48_000), 48_000, 16_000)))).toBeLessThan(-70);
    });

    it("reproduces a 1 kHz sine sample for sample from 44.1 kHz", () => {
        const out = resamplePcm(tone(1000, 1, 44_100), 44_100, 16_000);
        const ideal = tone(1000, 1, 16_000);
        expect(out.length).toBe(16_000);
        let err = 0;
        for (let i = 1600; i < 14_400; i += 1)
            err += ((out[i] as number) - (ideal[i] as number)) ** 2;
        expect(Math.sqrt(err / 12_800)).toBeLessThan(1e-3);
    });

    it("upsamples without changing the tone", () => {
        const out = resamplePcm(tone(440, 0.5, 16_000), 16_000, 48_000);
        expect(out.length).toBe(24_000);
        expect(Math.abs(db(middleRms(out)))).toBeLessThan(0.1);
    });

    it("returns a copy when the rates match", () => {
        const input = tone(100, 0.01, 16_000);
        const out = resamplePcm(input, 16_000, 16_000);
        expect(out).toEqual(input);
        expect(out).not.toBe(input);
    });

    it("handles an empty signal", () => {
        expect(resamplePcm(new Float32Array(0), 48_000, 16_000)).toHaveLength(0);
    });
});

describe("createSincResampler", () => {
    it("gives the same samples fed in uneven chunks as fed at once", () => {
        const input = tone(1000, 0.3, 44_100);
        const whole = resamplePcm(input, 44_100, 16_000);

        const streaming = createSincResampler(44_100, 16_000);
        const parts: Float32Array[] = [];
        for (let at = 0; at < input.length; at += 128 + (at % 7)) {
            parts.push(streaming.process(input.subarray(at, at + 128 + (at % 7))));
        }
        parts.push(streaming.flush());
        const joined = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
        let offset = 0;
        for (const part of parts) {
            joined.set(part, offset);
            offset += part.length;
        }
        for (let i = 0; i < whole.length; i += 1) {
            expect(joined[i]).toBeCloseTo(whole[i] as number, 6);
        }
    });

    it("resets after flush so the next signal starts clean", () => {
        const resampler = createSincResampler(48_000, 16_000);
        resampler.process(tone(1000, 0.1, 48_000));
        resampler.flush();
        const silent = resampler.process(new Float32Array(4800));
        expect(silent.every((x) => x === 0)).toBe(true);
    });
});

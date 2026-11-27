/**
 * Band-limited sample-rate conversion for audio headed to a model.
 */

/** A stateful converter fed in chunks. */
export interface SincResampler {
    /**
     * Convert the next chunk. Output lags input by the filter's half-width, so
     * the first calls return fewer samples than the ratio predicts; `flush()`
     * hands back the remainder.
     *
     * @param input Samples at the source rate.
     * @returns Samples at the target rate (possibly empty).
     */
    process(input: Float32Array): Float32Array;
    /**
     * Drain what the filter is still holding, as if the input continued with
     * silence. The resampler is reset afterwards.
     *
     * @returns The remaining samples at the target rate.
     */
    flush(): Float32Array;
}

/**
 * Create a windowed-sinc resampler for any rate pair.
 *
 * Why not the browser's: measured on Chromium 159, decoding a 48 kHz WAV
 * straight into a 16 kHz `OfflineAudioContext` lets a 9 kHz tone (above the
 * new 8 kHz Nyquist) through at −20 dB and cuts a 7 kHz tone by −5 dB. This
 * filter keeps the 7 kHz tone within 0.1 dB and pushes the 9 kHz one below
 * −70 dB (pinned in `resample.test.ts`), and — the part that matters for a
 * model — it is the **same** filter for a decoded file and for the live
 * microphone, so a model sees one spectrum whichever way the audio came in.
 *
 * Design: Kaiser-windowed sinc (β = 8.6), 32 zero crossings each side,
 * cutoff at 95 % of the lower Nyquist. The kernel is tabulated at 512 phases,
 * and the taps for each fractional phase are computed once and cached: the
 * phase sequence repeats (one phase for 48 → 16 kHz, 160 for 44.1 → 16 kHz),
 * so steady state is a plain dot product. Snapping the phase to 1/512 of a
 * sample moves each output by under 1/1024 of an input sample.
 *
 * Measured with `vitest` on Node 24 (48 → 16 kHz, 1 s tones, RMS of the middle
 * 80 %): the configurations tried, and why this one:
 *
 * | zero crossings | cutoff | 7 kHz | 7.5 kHz | 9 kHz | 30 s of audio |
 * | --- | --- | --- | --- | --- | --- |
 * | 32 | 0.92 | −0.37 dB | −11.7 dB | −114 dB | 633 ms |
 * | **32** | **0.95** | **−0.01 dB** | −3.5 dB | **−94 dB** | 570 ms |
 * | 48 | 0.95 | 0.00 dB | −2.5 dB | −104 dB | 828 ms |
 * | 64 | 0.96 | 0.00 dB | −0.4 dB | −107 dB | 1083 ms |
 *
 * Timings above are before the per-phase cache; with it, the chosen row
 * converts 30 s in 350 ms on the same machine.
 *
 * The function is **self-contained on purpose** — no import, no closure over
 * module state: `createPcmStream` ships its source text into an
 * `AudioWorklet`, where nothing from this module exists.
 *
 * @param fromRate Source sample rate in Hz.
 * @param toRate Target sample rate in Hz.
 * @returns The resampler.
 */
export function createSincResampler(fromRate: number, toRate: number): SincResampler {
    const ZERO_CROSSINGS = 32;
    const PHASES = 512;
    const BETA = 8.6;
    const CUTOFF = 0.95;

    const besselI0 = (x: number): number => {
        let sum = 1;
        let term = 1;
        for (let k = 1; k < 50; k += 1) {
            term *= (x / (2 * k)) * (x / (2 * k));
            sum += term;
            if (term < sum * 1e-12) break;
        }
        return sum;
    };

    const tableSize = ZERO_CROSSINGS * PHASES + 2;
    const table = new Float32Array(tableSize);
    const i0Beta = besselI0(BETA);
    for (let index = 0; index < tableSize; index += 1) {
        const v = index / PHASES;
        const sinc = v === 0 ? 1 : Math.sin(Math.PI * v) / (Math.PI * v);
        const ratio = v / ZERO_CROSSINGS;
        const window = ratio >= 1 ? 0 : besselI0(BETA * Math.sqrt(1 - ratio * ratio)) / i0Beta;
        table[index] = sinc * window;
    }

    const step = fromRate / toRate;
    const scale = Math.min(1, toRate / fromRate) * CUTOFF;
    const support = ZERO_CROSSINGS / scale;
    const reach = Math.ceil(support);

    let buffer = new Float32Array(0);
    let position = 0;
    let started = false;

    const kernel = (distance: number): number => {
        const v = Math.abs(distance) * scale * PHASES;
        const index = Math.floor(v);
        if (index >= tableSize - 1) return 0;
        const frac = v - index;
        return (table[index] as number) * (1 - frac) + (table[index + 1] as number) * frac;
    };

    const taps = 2 * reach;
    const weightsByPhase = new Map<number, Float32Array>();
    const weightsFor = (phase: number): Float32Array => {
        let weights = weightsByPhase.get(phase);
        if (!weights) {
            weights = new Float32Array(taps);
            const frac = phase / PHASES;
            for (let t = 0; t < taps; t += 1) weights[t] = kernel(frac + reach - 1 - t) * scale;
            weightsByPhase.set(phase, weights);
        }
        return weights;
    };

    const run = (input: Float32Array, final: boolean): Float32Array => {
        if (!started) {
            buffer = new Float32Array(reach);
            position = reach;
            started = true;
        }
        const tail = final ? reach + 1 : 0;
        const joined = new Float32Array(buffer.length + input.length + tail);
        joined.set(buffer, 0);
        joined.set(input, buffer.length);
        const limit = final ? buffer.length + input.length : joined.length - reach - 1;
        const out: number[] = [];
        while (position < limit) {
            let center = Math.floor(position);
            let phase = Math.round((position - center) * PHASES);
            if (phase === PHASES) {
                phase = 0;
                center += 1;
            }
            const weights = weightsFor(phase);
            const first = center - reach + 1;
            let acc = 0;
            for (let t = 0; t < taps; t += 1) {
                const k = first + t;
                if (k >= 0 && k < joined.length)
                    acc += (joined[k] as number) * (weights[t] as number);
            }
            out.push(acc);
            position += step;
        }
        const keepFrom = Math.max(0, Math.floor(position) - reach);
        buffer = joined.slice(keepFrom, final ? keepFrom : joined.length - tail);
        position -= keepFrom;
        if (final) {
            buffer = new Float32Array(0);
            position = 0;
            started = false;
        }
        return Float32Array.from(out);
    };

    return {
        process: (input: Float32Array): Float32Array => run(input, false),
        flush: (): Float32Array => run(new Float32Array(0), true),
    };
}

/**
 * Convert a whole signal between sample rates with {@link createSincResampler}.
 *
 * The output is trimmed to `round(length × toRate / fromRate)` samples and
 * aligned with the input: the filter's start-up delay is compensated, so
 * sample `n` of the output sits at time `n / toRate` of the input.
 *
 * @param samples The signal at `fromRate`.
 * @param fromRate Source rate in Hz.
 * @param toRate Target rate in Hz.
 * @returns The signal at `toRate` (a copy, even when the rates match).
 *
 * @example
 * ```typescript
 * import { resamplePcm } from "tempest-react-sdk";
 *
 * const at48k = new Float32Array(48_000);
 * const at16k = resamplePcm(at48k, 48_000, 16_000);
 * console.log(at16k.length); // 16000
 * ```
 */
export function resamplePcm(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return samples.slice();
    const resampler = createSincResampler(fromRate, toRate);
    const head = resampler.process(samples);
    const tail = resampler.flush();
    const all = new Float32Array(head.length + tail.length);
    all.set(head, 0);
    all.set(tail, head.length);
    return all.subarray(0, Math.round((samples.length * toRate) / fromRate)).slice();
}

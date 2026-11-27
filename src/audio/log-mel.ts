/**
 * Log-mel spectrograms with the exact parameters audio models were trained on.
 */

/** How the mel energies are turned into model input. */
export type LogMelScaling =
    /**
     * Whisper: `log10(max(mel, 1e-10))`, floored at `max − 8`, then
     * `(x + 4) / 4`. The floor is relative to the loudest bin of the whole
     * input, so the same audio padded differently scales the same.
     */
    | "whisper"
    /** Natural log of `mel + offset` (YAMNet uses `offset = 0.001`). */
    | { log: "natural"; offset: number };

/** Parameters of a log-mel front end. */
export interface LogMelConfig {
    /** Input sample rate in Hz. */
    sampleRate: number;
    /** FFT size (also the window length). Any size; 400 for Whisper. */
    nFft: number;
    /** Samples between frames. */
    hopLength: number;
    /** Mel bands. */
    nMels: number;
    /** Lowest filter edge in Hz. Default `0`. */
    fMin?: number;
    /** Highest filter edge in Hz. Default `sampleRate / 2`. */
    fMax?: number;
    /**
     * Pad `nFft / 2` samples on both sides by reflection, so frame `i` is
     * centred on sample `i × hop` (`torch.stft(center=True)`). Default `true`.
     */
    center?: boolean;
    /**
     * Drop the last frame, as Whisper does (`stft[..., :-1]`), so 30 s gives
     * exactly 3000 frames. Default `false`.
     */
    dropLastFrame?: boolean;
    scaling: LogMelScaling;
}

/** A spectrogram, row-major by mel band: `data[band * frames + frame]`. */
export interface LogMelSpectrogram {
    data: Float32Array;
    nMels: number;
    frames: number;
}

/**
 * Whisper's front end with 80 bands (tiny … large-v2, and turbo's encoder
 * predecessors). Pinned against `whisper.audio.log_mel_spectrogram` and
 * `transformers.WhisperFeatureExtractor` in `log-mel.test.ts`.
 */
export const WHISPER_LOG_MEL_80: LogMelConfig = {
    sampleRate: 16_000,
    nFft: 400,
    hopLength: 160,
    nMels: 80,
    dropLastFrame: true,
    scaling: "whisper",
};

/** Whisper large-v3 / large-v3-turbo: the same front end with 128 bands. */
export const WHISPER_LOG_MEL_128: LogMelConfig = { ...WHISPER_LOG_MEL_80, nMels: 128 };

/** A complex FFT for one size, mixed radix. */
interface FftPlan {
    n: number;
    run(re: Float64Array, im: Float64Array): void;
}

/**
 * Smallest factor of `n` greater than 1.
 *
 * @param n A positive integer.
 * @returns The factor (`n` itself when prime).
 */
function smallestFactor(n: number): number {
    if (n % 4 === 0) return 4;
    for (let f = 2; f * f <= n; f += 1) if (n % f === 0) return f;
    return n;
}

/**
 * Build a recursive decimation-in-time FFT for size `n`.
 *
 * Whisper's 400-point FFT is not a power of two (400 = 4·4·5·5), so radix-2
 * alone would mean padding to 512 and a different spectrum. Each stage splits
 * by the smallest factor and recombines with precomputed twiddles; a prime
 * remainder falls back to a direct DFT, which for the sizes models use (400,
 * 512, 1024) never happens.
 *
 * @param n Transform size.
 * @returns The plan.
 */
function planFft(n: number): FftPlan {
    const cos = new Float64Array(n);
    const sin = new Float64Array(n);
    for (let k = 0; k < n; k += 1) {
        cos[k] = Math.cos((-2 * Math.PI * k) / n);
        sin[k] = Math.sin((-2 * Math.PI * k) / n);
    }

    const transform = (
        re: Float64Array,
        im: Float64Array,
        offset: number,
        stride: number,
        size: number,
        outRe: Float64Array,
        outIm: Float64Array,
        outOffset: number,
    ): void => {
        if (size === 1) {
            outRe[outOffset] = re[offset] as number;
            outIm[outOffset] = im[offset] as number;
            return;
        }
        const radix = smallestFactor(size);
        const m = size / radix;
        if (m === 1) {
            for (let k = 0; k < size; k += 1) {
                let sr = 0;
                let si = 0;
                for (let j = 0; j < size; j += 1) {
                    const t = ((j * k) % size) * (n / size);
                    const xr = re[offset + j * stride] as number;
                    const xi = im[offset + j * stride] as number;
                    sr += xr * (cos[t] as number) - xi * (sin[t] as number);
                    si += xr * (sin[t] as number) + xi * (cos[t] as number);
                }
                outRe[outOffset + k] = sr;
                outIm[outOffset + k] = si;
            }
            return;
        }
        for (let r = 0; r < radix; r += 1) {
            transform(
                re,
                im,
                offset + r * stride,
                stride * radix,
                m,
                outRe,
                outIm,
                outOffset + r * m,
            );
        }
        const tmpRe = new Float64Array(radix);
        const tmpIm = new Float64Array(radix);
        for (let k = 0; k < m; k += 1) {
            for (let r = 0; r < radix; r += 1) {
                const t = ((r * k) % size) * (n / size);
                const ar = outRe[outOffset + r * m + k] as number;
                const ai = outIm[outOffset + r * m + k] as number;
                tmpRe[r] = ar * (cos[t] as number) - ai * (sin[t] as number);
                tmpIm[r] = ar * (sin[t] as number) + ai * (cos[t] as number);
            }
            for (let q = 0; q < radix; q += 1) {
                let sr = 0;
                let si = 0;
                for (let r = 0; r < radix; r += 1) {
                    const t = ((r * q * m) % size) * (n / size);
                    sr +=
                        (tmpRe[r] as number) * (cos[t] as number) -
                        (tmpIm[r] as number) * (sin[t] as number);
                    si +=
                        (tmpRe[r] as number) * (sin[t] as number) +
                        (tmpIm[r] as number) * (cos[t] as number);
                }
                outRe[outOffset + q * m + k] = sr;
                outIm[outOffset + q * m + k] = si;
            }
        }
    };

    const outRe = new Float64Array(n);
    const outIm = new Float64Array(n);
    return {
        n,
        run(re: Float64Array, im: Float64Array): void {
            transform(re, im, 0, 1, n, outRe, outIm, 0);
            re.set(outRe);
            im.set(outIm);
        },
    };
}

/**
 * Hz → mel on the Slaney scale (linear below 1 kHz, logarithmic above), the
 * `htk=False` default of `librosa.filters.mel` that Whisper's filters use.
 *
 * @param hz Frequency.
 * @returns Mel.
 */
function hzToMel(hz: number): number {
    const fSp = 200 / 3;
    const minLogHz = 1000;
    const minLogMel = minLogHz / fSp;
    const logStep = Math.log(6.4) / 27;
    return hz >= minLogHz ? minLogMel + Math.log(hz / minLogHz) / logStep : hz / fSp;
}

/**
 * Mel → Hz on the Slaney scale.
 *
 * @param mel Mel.
 * @returns Frequency.
 */
function melToHz(mel: number): number {
    const fSp = 200 / 3;
    const minLogHz = 1000;
    const minLogMel = minLogHz / fSp;
    const logStep = Math.log(6.4) / 27;
    return mel >= minLogMel ? minLogHz * Math.exp(logStep * (mel - minLogMel)) : fSp * mel;
}

/** A triangular filter stored as its non-zero span. */
interface MelFilter {
    first: number;
    weights: Float64Array;
}

/**
 * Slaney-normalised triangular mel filters over the FFT bins
 * (`librosa.filters.mel(norm="slaney")`).
 *
 * @param config The front end.
 * @returns One sparse filter per band.
 */
function melFilters(config: LogMelConfig): MelFilter[] {
    const bins = Math.floor(config.nFft / 2) + 1;
    const fMin = config.fMin ?? 0;
    const fMax = config.fMax ?? config.sampleRate / 2;
    const fftFreqs = Array.from({ length: bins }, (_, i) => (i * config.sampleRate) / config.nFft);
    const melMin = hzToMel(fMin);
    const melMax = hzToMel(fMax);
    const points = Array.from({ length: config.nMels + 2 }, (_, i) =>
        melToHz(melMin + ((melMax - melMin) * i) / (config.nMels + 1)),
    );
    const filters: MelFilter[] = [];
    for (let m = 0; m < config.nMels; m += 1) {
        const lower = points[m] as number;
        const center = points[m + 1] as number;
        const upper = points[m + 2] as number;
        const norm = 2 / (upper - lower);
        const row = new Float64Array(bins);
        let first = -1;
        let last = -1;
        for (let b = 0; b < bins; b += 1) {
            const f = fftFreqs[b] as number;
            const rising = (f - lower) / (center - lower);
            const falling = (upper - f) / (upper - center);
            const w = Math.max(0, Math.min(rising, falling)) * norm;
            row[b] = w;
            if (w > 0) {
                if (first === -1) first = b;
                last = b;
            }
        }
        filters.push(
            first === -1
                ? { first: 0, weights: new Float64Array(0) }
                : { first, weights: row.slice(first, last + 1) },
        );
    }
    return filters;
}

/**
 * Compute a log-mel spectrogram.
 *
 * Every step mirrors the reference the presets name, because a model fed
 * features computed slightly differently does not fail — it just gets worse,
 * silently. The Whisper preset is pinned against a numpy port of
 * `whisper.audio.log_mel_spectrogram`, itself checked against
 * `transformers.WhisperFeatureExtractor` (max difference 1.2e-7); this
 * implementation matches that reference to 1.2e-7 too — float32 epsilon — and
 * computes 30 s (3000 frames) in 83 ms on Node 24. The fixture and the script
 * that makes it are in the repo (`scripts/gen-log-mel-fixture.py`).
 *
 * The window is a periodic Hann of `nFft` samples; the power spectrum is used
 * (`|X|²`).
 *
 * @param samples Mono PCM at `config.sampleRate` (see `decodeAudioToPcm`).
 * @param config The front end — a preset such as {@link WHISPER_LOG_MEL_80} or your model's.
 * @returns The spectrogram, row-major by band.
 * @throws RangeError when the input is shorter than half a window with `center`.
 *
 * @example
 * ```typescript
 * import { WHISPER_LOG_MEL_80, logMelSpectrogram } from "tempest-react-sdk";
 *
 * const mel = logMelSpectrogram(new Float32Array(16_000), WHISPER_LOG_MEL_80);
 * console.log(mel.nMels, mel.frames); // 80 100
 * ```
 */
export function logMelSpectrogram(samples: Float32Array, config: LogMelConfig): LogMelSpectrogram {
    const { nFft, hopLength, nMels } = config;
    const center = config.center ?? true;
    const pad = center ? Math.floor(nFft / 2) : 0;
    if (center && samples.length <= pad) {
        throw new RangeError(
            `logMelSpectrogram needs more than ${pad} samples with center padding.`,
        );
    }

    const padded = new Float64Array(samples.length + 2 * pad);
    for (let i = 0; i < samples.length; i += 1) padded[pad + i] = samples[i] as number;
    for (let i = 1; i <= pad; i += 1) {
        padded[pad - i] = samples[i] as number;
        padded[pad + samples.length - 1 + i] = samples[samples.length - 1 - i] as number;
    }

    const totalFrames =
        padded.length >= nFft ? 1 + Math.floor((padded.length - nFft) / hopLength) : 0;
    const frames = Math.max(0, config.dropLastFrame ? totalFrames - 1 : totalFrames);
    const window = new Float64Array(nFft);
    for (let i = 0; i < nFft; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nFft);

    const fft = planFft(nFft);
    const filters = melFilters(config);
    const bins = Math.floor(nFft / 2) + 1;
    const re = new Float64Array(nFft);
    const im = new Float64Array(nFft);
    const power = new Float64Array(bins);
    const mel = new Float64Array(nMels * frames);

    for (let frame = 0; frame < frames; frame += 1) {
        const start = frame * hopLength;
        for (let i = 0; i < nFft; i += 1) {
            re[i] = (padded[start + i] as number) * (window[i] as number);
            im[i] = 0;
        }
        fft.run(re, im);
        for (let b = 0; b < bins; b += 1) {
            power[b] = (re[b] as number) ** 2 + (im[b] as number) ** 2;
        }
        for (let m = 0; m < nMels; m += 1) {
            const filter = filters[m] as MelFilter;
            let sum = 0;
            for (let k = 0; k < filter.weights.length; k += 1) {
                sum += (filter.weights[k] as number) * (power[filter.first + k] as number);
            }
            mel[m * frames + frame] = sum;
        }
    }

    const data = new Float32Array(mel.length);
    if (config.scaling === "whisper") {
        let max = -Infinity;
        for (let i = 0; i < mel.length; i += 1) {
            const v = Math.log10(Math.max(mel[i] as number, 1e-10));
            mel[i] = v;
            if (v > max) max = v;
        }
        for (let i = 0; i < mel.length; i += 1) {
            data[i] = (Math.max(mel[i] as number, max - 8) + 4) / 4;
        }
    } else {
        const { offset } = config.scaling;
        for (let i = 0; i < mel.length; i += 1) data[i] = Math.log((mel[i] as number) + offset);
    }
    return { data, nMels, frames };
}

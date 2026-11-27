import { afterEach, describe, expect, it, vi } from "vitest";

const pcm = vi.hoisted(() => ({
    onFrame: null as null | ((frame: Float32Array) => void),
    release: vi.fn(),
    options: null as unknown,
}));

vi.mock("@/audio/pcm-stream", () => ({
    createPcmStream: vi.fn(
        async (_source: unknown, options: { onFrame: (f: Float32Array) => void }) => {
            pcm.onFrame = options.onFrame;
            pcm.options = options;
            return {
                sampleRate: 16_000,
                frameSize: 512,
                hopSize: 512,
                pause: vi.fn(),
                resume: vi.fn(),
                release: pcm.release,
            };
        },
    ),
}));

import {
    SILERO_CONTEXT_SAMPLES,
    SILERO_FRAME_SAMPLES,
    createSileroVad,
    createSpeechDetector,
    detectSpeechSegments,
    sileroNegThreshold,
    type SileroVad,
} from "./vad";

/** Minimal stand-in for `ort.Tensor`. */
class FakeTensor {
    constructor(
        readonly type: string,
        readonly data: unknown,
        readonly dims: readonly number[],
    ) {}
}

/**
 * A session that answers `script` in order and records its inputs.
 *
 * @param script Probabilities to return.
 * @returns The session and the recorded feeds.
 */
function session(script: number[]) {
    const feeds: Record<string, FakeTensor>[] = [];
    let call = 0;
    return {
        feeds,
        run: vi.fn(async (input: Record<string, FakeTensor>) => {
            feeds.push(input);
            const p = script[Math.min(call, script.length - 1)] as number;
            call += 1;
            return {
                output: new FakeTensor("float32", new Float32Array([p]), [1, 1]),
                stateN: new FakeTensor("float32", new Float32Array(256).fill(call), [2, 1, 128]),
            };
        }),
        release: vi.fn(async () => undefined),
    };
}

/**
 * A VAD whose probabilities are scripted per frame.
 *
 * @param script One probability per frame.
 * @returns The VAD.
 */
function scripted(script: number[]): SileroVad {
    return createSileroVad({ Tensor: FakeTensor } as never, session(script) as never);
}

const frames = (n: number): Float32Array => new Float32Array(n * SILERO_FRAME_SAMPLES);
const frameMs = (SILERO_FRAME_SAMPLES / 16_000) * 1000;

afterEach(() => {
    vi.clearAllMocks();
});

describe("createSileroVad", () => {
    it("feeds the previous 64 samples ahead of each 512-sample frame, with state and rate", async () => {
        const fake = session([0.1, 0.9]);
        const vad = createSileroVad({ Tensor: FakeTensor } as never, fake as never);
        const first = Float32Array.from({ length: 512 }, (_, i) => i);
        expect(await vad.probability(first)).toBeCloseTo(0.1);
        await vad.probability(new Float32Array(512));
        const [a, b] = fake.feeds as [Record<string, FakeTensor>, Record<string, FakeTensor>];
        expect(a.input?.dims).toEqual([1, SILERO_CONTEXT_SAMPLES + SILERO_FRAME_SAMPLES]);
        expect(
            Array.from((a.input?.data as Float32Array).subarray(0, 64)).every((x) => x === 0),
        ).toBe(true);
        expect(Array.from((b.input?.data as Float32Array).subarray(0, 64))).toEqual(
            Array.from({ length: 64 }, (_, i) => 448 + i),
        );
        expect((a.state?.data as Float32Array).every((x) => x === 0)).toBe(true);
        expect((b.state?.data as Float32Array)[0]).toBe(1);
        expect(a.state?.dims).toEqual([2, 1, 128]);
        expect(Array.from(a.sr?.data as BigInt64Array)).toEqual([16_000n]);
    });

    it("starts clean after reset", async () => {
        const fake = session([0.5]);
        const vad = createSileroVad({ Tensor: FakeTensor } as never, fake as never);
        await vad.probability(new Float32Array(512).fill(1));
        vad.reset();
        await vad.probability(new Float32Array(512));
        const last = fake.feeds[1] as Record<string, FakeTensor>;
        expect((last.input?.data as Float32Array).subarray(0, 64).every((x) => x === 0)).toBe(true);
        expect((last.state?.data as Float32Array).every((x) => x === 0)).toBe(true);
    });

    it("serialises concurrent calls so the state is never read twice", async () => {
        const fake = session([0.2, 0.3, 0.4]);
        const vad = createSileroVad({ Tensor: FakeTensor } as never, fake as never);
        const all = await Promise.all([1, 2, 3].map(() => vad.probability(new Float32Array(512))));
        expect(all.map((p) => Math.round(p * 10))).toEqual([2, 3, 4]);
        expect((fake.feeds[2]?.state?.data as Float32Array)[0]).toBe(2);
    });

    it("refuses a frame of the wrong length and keeps working after", async () => {
        const vad = scripted([0.7]);
        await expect(vad.probability(new Float32Array(480))).rejects.toThrow(RangeError);
        await expect(vad.probability(new Float32Array(512))).resolves.toBeCloseTo(0.7);
        await vad.release();
    });

    it("ports silero's exit threshold", () => {
        expect(sileroNegThreshold(0.5)).toBeCloseTo(0.35);
        expect(sileroNegThreshold(0.1)).toBe(0.01);
    });
});

describe("detectSpeechSegments", () => {
    it("finds speech with hysteresis, drops blips and pads each side", async () => {
        const script = [
            0.1,
            0.1,
            ...Array(20).fill(0.9),
            0.4,
            0.9,
            ...Array(10).fill(0.1),
            0.9,
            ...Array(10).fill(0.1),
        ];
        const segments = await detectSpeechSegments(frames(script.length), scripted(script), {
            minSilenceMs: 100,
            minSpeechMs: 250,
            padMs: 30,
        });
        expect(segments).toHaveLength(1);
        expect(segments[0]?.startMs).toBeCloseTo(2 * frameMs - 30, 5);
        expect(segments[0]?.endMs).toBeCloseTo(24 * frameMs + 30, 5);
    });

    it("splits two segments and never lets padding overlap", async () => {
        const script = [...Array(10).fill(0.9), ...Array(6).fill(0.1), ...Array(10).fill(0.9)];
        const segments = await detectSpeechSegments(frames(script.length), scripted(script), {
            minSilenceMs: 100,
            padMs: 200,
        });
        expect(segments).toHaveLength(2);
        expect(segments[0]?.endMs).toBeLessThanOrEqual(segments[1]?.startMs as number);
    });

    it("keeps speech running to the end, and resamples MonoPcm", async () => {
        const segments = await detectSpeechSegments(
            { samples: new Float32Array(48_000), sampleRate: 48_000 },
            scripted([0.1, ...Array(40).fill(0.9)]),
        );
        expect(segments).toHaveLength(1);
        expect(segments[0]?.endMs).toBe(1000);
    });

    it("returns nothing for silence", async () => {
        expect(await detectSpeechSegments(frames(20), scripted([0.05]))).toEqual([]);
    });
});

describe("createSpeechDetector", () => {
    it("turns on at the threshold and off after the silence, with createPcmStream at 16 kHz × 512", async () => {
        const changes: boolean[] = [];
        const probabilities: number[] = [];
        const script = [0.1, 0.8, 0.9, 0.3, 0.3, 0.3, 0.3, 0.9];
        const detector = await createSpeechDetector(
            {} as MediaStreamTrack,
            (s) => changes.push(s),
            {
                vad: scripted(script),
                minSilenceMs: 100,
                onProbability: (p) => probabilities.push(p),
            },
        );
        expect(pcm.options).toMatchObject({ sampleRate: 16_000, frameSize: 512 });
        for (let i = 0; i < script.length; i += 1) {
            pcm.onFrame?.(new Float32Array(512));
            await vi.waitFor(() => expect(probabilities).toHaveLength(i + 1));
        }
        expect(changes).toEqual([true, false, true]);
        expect(detector.speaking).toBe(true);
        detector.stop();
        detector.stop();
        expect(pcm.release).toHaveBeenCalledTimes(1);
    });

    it("ignores frames that finish after stop", async () => {
        const changes: boolean[] = [];
        const detector = await createSpeechDetector(
            {} as MediaStreamTrack,
            (s) => changes.push(s),
            {
                vad: scripted([0.9]),
            },
        );
        pcm.onFrame?.(new Float32Array(512));
        detector.stop();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(changes).toEqual([]);
    });
});

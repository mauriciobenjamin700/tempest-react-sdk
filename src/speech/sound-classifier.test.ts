import { afterEach, describe, expect, it, vi } from "vitest";

const pcm = vi.hoisted(() => ({
    onFrame: null as null | ((frame: Float32Array) => void),
    options: null as unknown,
    release: vi.fn(),
}));

vi.mock("@/audio/pcm-stream", () => ({
    createPcmStream: vi.fn(async (_s: unknown, options: { onFrame: (f: Float32Array) => void }) => {
        pcm.onFrame = options.onFrame;
        pcm.options = options;
        return {
            sampleRate: 16_000,
            frameSize: 15_600,
            hopSize: 8000,
            pause: vi.fn(),
            resume: vi.fn(),
            release: pcm.release,
        };
    }),
}));

vi.mock("@/audio/decode-pcm", () => ({
    decodeAudioToPcm: vi.fn(async (_b: Blob, o: { sampleRate: number }) => ({
        samples: new Float32Array(o.sampleRate),
        sampleRate: o.sampleRate,
    })),
}));

import { WHISPER_LOG_MEL_80 } from "@/audio/log-mel";

import { createAudioModel } from "./audio-model";
import {
    YAMNET_WINDOW_SAMPLES,
    createSoundClassifier,
    createSoundMonitor,
    parseClassMap,
    parseCsvLine,
    type SoundClassifier,
} from "./sound-classifier";

/** Minimal stand-in for `ort.Tensor`. */
class FakeTensor {
    constructor(
        readonly type: string,
        readonly data: Float32Array,
        readonly dims: readonly number[],
    ) {}
}

/**
 * A session returning fixed scores and recording its input.
 *
 * @param scores Row-major `[frames, classes]`.
 * @param classes Class count.
 * @returns The session and its recorded feeds.
 */
function session(scores: number[], classes: number) {
    const feeds: Record<string, FakeTensor>[] = [];
    return {
        feeds,
        inputNames: ["waveform"],
        outputNames: ["scores", "embeddings"],
        run: vi.fn(async (input: Record<string, FakeTensor>) => {
            feeds.push(input);
            return {
                scores: new FakeTensor("float32", Float32Array.from(scores), [
                    scores.length / classes,
                    classes,
                ]),
                embeddings: new FakeTensor("float32", new Float32Array(2), [1, 2]),
            };
        }),
        release: vi.fn(async () => undefined),
    };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe("createAudioModel", () => {
    it("feeds a waveform as [samples] and hands every output back", async () => {
        const fake = session([0.1, 0.9], 2);
        const model = createAudioModel({ Tensor: FakeTensor } as never, fake as never, {
            feature: "waveform",
        });
        const outputs = await model.run(new Float32Array(16_000));
        expect(fake.feeds[0]?.waveform?.dims).toEqual([16_000]);
        expect(outputs.scores?.dims).toEqual([1, 2]);
        expect(outputs.embeddings?.dims).toEqual([1, 2]);
        expect(model.outputNames).toEqual(["scores", "embeddings"]);
    });

    it("computes the declared log-mel and shapes it [1, mels, frames] unless told otherwise", async () => {
        const fake = session([0.5], 1);
        const model = createAudioModel({ Tensor: FakeTensor } as never, fake as never, {
            feature: WHISPER_LOG_MEL_80,
        });
        await model.run(new Float32Array(16_000));
        expect(fake.feeds[0]?.waveform?.dims).toEqual([1, 80, 100]);

        const custom = session([0.5], 1);
        const shaped = createAudioModel({ Tensor: FakeTensor } as never, custom as never, {
            feature: "waveform",
            inputName: "audio",
            inputDims: ({ samples }) => [1, samples as number],
        });
        await shaped.run(new Float32Array(10));
        expect(custom.feeds[0]?.audio?.dims).toEqual([1, 10]);
    });

    it("decodes a recording and resamples PCM to the model's rate", async () => {
        const fake = session([0.5], 1);
        const model = createAudioModel({ Tensor: FakeTensor } as never, fake as never, {
            feature: "waveform",
        });
        await model.run(new Blob([new Uint8Array(4)]));
        expect(fake.feeds[0]?.waveform?.dims).toEqual([16_000]);
        await model.run({ samples: new Float32Array(48_000), sampleRate: 48_000 });
        expect(fake.feeds[1]?.waveform?.dims).toEqual([16_000]);
        await model.release();
        expect(fake.release).toHaveBeenCalled();
    });
});

describe("class map CSV", () => {
    it("keeps quoted names with commas whole", () => {
        expect(parseCsvLine('31,/m/07pp8cl,"Beep, bleep"')).toEqual([
            "31",
            "/m/07pp8cl",
            "Beep, bleep",
        ]);
        expect(parseCsvLine('1,"say ""hi""",x')).toEqual(["1", 'say "hi"', "x"]);
        expect(
            parseClassMap(
                'index,mid,display_name\r\n0,/m/09x0r,Speech\n1,/m/x,"Child speech, kid speaking"\n\n',
            ),
        ).toEqual(["Speech", "Child speech, kid speaking"]);
    });
});

describe("createSoundClassifier", () => {
    const model = (scores: number[], classes: number) =>
        createAudioModel({ Tensor: FakeTensor } as never, session(scores, classes) as never, {
            feature: "waveform",
        });

    it("returns per-frame scores at the hop and the top classes by mean", async () => {
        const classifier = createSoundClassifier(
            model([0.9, 0.1, 0.0, 0.7, 0.2, 0.1], 3),
            ["Speech", "Music", "Siren"],
            {
                topK: 2,
            },
        );
        const result = await classifier.classify(new Float32Array(16_000));
        expect(result.frames.map((f) => f.startMs)).toEqual([0, 480]);
        expect(result.top.map((s) => s.label)).toEqual(["Speech", "Music"]);
        expect(result.top[0]?.score).toBeCloseTo(0.8);
    });

    it("refuses a label count that does not match the model, or a missing output", async () => {
        await expect(
            createSoundClassifier(model([0.5, 0.5], 2), ["only one"]).classify(
                new Float32Array(10),
            ),
        ).rejects.toThrow(/2 classes but 1 labels/);
        await expect(
            createSoundClassifier(model([0.5], 1), ["a"], { scoresOutput: "nope" }).classify(
                new Float32Array(10),
            ),
        ).rejects.toThrow(/no output "nope"/);
    });
});

describe("createSoundMonitor", () => {
    /**
     * A classifier whose single frame per call comes from `script`.
     *
     * @param script One `[siren, music]` pair per window.
     * @returns The classifier.
     */
    function scripted(script: [number, number][]): SoundClassifier {
        let call = 0;
        return {
            labels: ["Siren", "Music"],
            classify: vi.fn(async () => {
                const [siren, music] = script[Math.min(call, script.length - 1)] as [
                    number,
                    number,
                ];
                call += 1;
                return {
                    frames: [{ startMs: 0, scores: Float32Array.from([siren, music]) }],
                    top: [],
                };
            }),
            release: vi.fn(async () => undefined),
        };
    }

    it("turns a class on and off with smoothing and hysteresis, windows of ~1 s every 0.5 s", async () => {
        const changes: string[][] = [];
        const classifier = scripted([
            [0.9, 0],
            [0.9, 0],
            [0.2, 0],
            [0.1, 0],
            [0.0, 0],
        ]);
        const monitor = await createSoundMonitor(
            {} as MediaStreamTrack,
            (a) => changes.push([...a]),
            {
                classifier,
                classes: ["Siren"],
                smoothing: 2,
            },
        );
        expect(pcm.options).toMatchObject({
            sampleRate: 16_000,
            frameSize: YAMNET_WINDOW_SAMPLES,
            hopSize: 8000,
        });
        for (let i = 0; i < 5; i += 1) {
            pcm.onFrame?.(new Float32Array(YAMNET_WINDOW_SAMPLES));
            await vi.waitFor(() => expect(classifier.classify).toHaveBeenCalledTimes(i + 1));
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        expect(changes).toEqual([["Siren"], []]);
        expect(monitor.active).toEqual([]);
        monitor.stop();
        expect(pcm.release).toHaveBeenCalled();
    });

    it("refuses a class the model does not have", async () => {
        await expect(
            createSoundMonitor({} as MediaStreamTrack, () => undefined, {
                classifier: scripted([[0, 0]]),
                classes: ["Dragon"],
            }),
        ).rejects.toThrow(/Unknown class "Dragon"/);
    });
});

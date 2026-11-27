/**
 * The classifier on the real YAMNet export (tf2onnx of Google's model, the
 * `rostrumstudios/yamnet` / `zeropointnine/yamnet-onnx` files, Apache-2.0).
 * Opt-in — the model is 16 MB and stays out of the repo:
 *
 *     M=/tmp/yamnet && mkdir -p $M && for f in yamnet.onnx yamnet_class_map.csv; do \
 *       curl -sfL -o $M/$f https://huggingface.co/rostrumstudios/yamnet/resolve/main/$f; done
 *     YAMNET_MODEL_DIR=$M npx vitest run src/speech/sound-classifier.yamnet.test.ts
 *
 * @vitest-environment node
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as ort from "onnxruntime-web";
import { describe, expect, it } from "vitest";

import { createAudioModel } from "./audio-model";
import { createSoundClassifier, parseClassMap } from "./sound-classifier";

const DIR = process.env.YAMNET_MODEL_DIR;

describe.skipIf(!DIR)("YAMNet", () => {
    /**
     * Load the real model.
     *
     * @returns The classifier.
     */
    async function classifier() {
        ort.env.wasm.numThreads = 1;
        const session = await ort.InferenceSession.create(
            readFileSync(join(DIR as string, "yamnet.onnx")),
        );
        const labels = parseClassMap(
            readFileSync(join(DIR as string, "yamnet_class_map.csv"), "utf8"),
        );
        return createSoundClassifier(
            createAudioModel(ort, session, { feature: "waveform" }),
            labels,
        );
    }

    it("names a 1 kHz tone and silence", async () => {
        const yamnet = await classifier();
        expect(yamnet.labels).toHaveLength(521);
        const tone = Float32Array.from(
            { length: 48_000 },
            (_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / 16_000),
        );
        expect((await yamnet.classify(tone)).top[0]?.label).toBe("Beep, bleep");
        const silence = await yamnet.classify(new Float32Array(32_000));
        expect(silence.top[0]).toMatchObject({ label: "Silence" });
        expect(silence.frames).toHaveLength(4);
        await yamnet.release();
    }, 60_000);
});

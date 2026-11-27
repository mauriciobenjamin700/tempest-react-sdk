#!/usr/bin/env node
// @ts-check

/**
 * Frame accuracy of Silero VAD against the SDK's energy VAD, on speech mixed
 * with noise (fixtures from `scripts/gen-vad-fixtures.py`).
 *
 * Three detectors, each giving a speech/no-speech decision per 32 ms frame,
 * scored against labels taken from the CLEAN signal:
 *
 * - **energy (default)** — what `monitorVoiceActivity` does with its defaults:
 *   RMS of ~21 ms (1024 samples at 48 kHz) sampled every 100 ms against 0.045,
 *   held for 350 ms.
 * - **energy (calibrated)** — the same, with the threshold from
 *   `suggestGateThreshold()` over the noise floor of the first second (pure
 *   noise in these fixtures): the best an app can do with the energy VAD.
 * - **silero** — `createSileroVad` + the live detector's hysteresis
 *   (threshold 0.5, exit 0.35, 100 ms of silence).
 *
 * Usage:
 *
 *     npm run build
 *     DATASET_DIR=/tmp/vad-data SILERO_MODEL=/tmp/silero_vad.onnx \
 *       node --import ./loader/css-loader.mjs scripts/bench-vad.mjs
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as ort from "onnxruntime-web";

import { suggestGateThreshold } from "../dist/tempest-react-sdk.js";
import { createSileroVad, sileroNegThreshold } from "../dist/speech.js";

const DATASET_DIR = process.env.DATASET_DIR;
const SILERO_MODEL = process.env.SILERO_MODEL;
if (!DATASET_DIR || !SILERO_MODEL) {
    console.error("bench-vad: set DATASET_DIR and SILERO_MODEL");
    process.exit(1);
}
const FRAME = 512;
const RATE = 16_000;
const WINDOW = Math.round((1024 * RATE) / 48_000);

/** @type {{ file: string, noise: string, snr: number | null, labels: number[] }[]} */
const meta = JSON.parse(readFileSync(join(DATASET_DIR, "meta.json"), "utf8"));
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(readFileSync(SILERO_MODEL));
const vad = createSileroVad(ort, session);

/**
 * @param {string} file
 * @returns {Float32Array}
 */
function load(file) {
    const bytes = readFileSync(join(DATASET_DIR, file));
    return new Float32Array(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
}

/**
 * @param {Float32Array} samples
 * @param {number} end Exclusive end sample.
 * @returns {number}
 */
function rmsBefore(samples, end) {
    let sum = 0;
    const from = Math.max(0, end - WINDOW);
    for (let i = from; i < end; i += 1) sum += (samples[i] ?? 0) ** 2;
    return Math.sqrt(sum / Math.max(1, end - from));
}

/**
 * Energy VAD as monitorVoiceActivity runs it, sampled to frame decisions.
 *
 * @param {Float32Array} samples
 * @param {number} threshold
 * @param {number} frames
 * @returns {number[]}
 */
function energy(samples, threshold, frames) {
    const out = [];
    let lastLoud = -Infinity;
    let nextPoll = 0;
    let speaking = false;
    for (let f = 0; f < frames; f += 1) {
        const ms = ((f + 1) * FRAME * 1000) / RATE;
        while (nextPoll <= ms) {
            if (rmsBefore(samples, Math.round((nextPoll * RATE) / 1000)) >= threshold)
                lastLoud = nextPoll;
            speaking = nextPoll - lastLoud < 350;
            nextPoll += 100;
        }
        out.push(speaking ? 1 : 0);
    }
    return out;
}

/**
 * Silero with the live detector's hysteresis.
 *
 * @param {Float32Array} samples
 * @param {number} frames
 * @returns {Promise<number[]>}
 */
async function silero(samples, frames) {
    vad.reset();
    const started = performance.now();
    const out = [];
    let speaking = false;
    let silent = 0;
    const neg = sileroNegThreshold(0.5);
    for (let f = 0; f < frames; f += 1) {
        const frame = new Float32Array(FRAME);
        frame.set(samples.subarray(f * FRAME, (f + 1) * FRAME));
        const p = await vad.probability(frame);
        if (p >= 0.5) {
            speaking = true;
            silent = 0;
        } else if (speaking && p < neg) {
            silent += (FRAME * 1000) / RATE;
            if (silent >= 100) {
                speaking = false;
                silent = 0;
            }
        }
        out.push(speaking ? 1 : 0);
    }
    sileroMs += performance.now() - started;
    sileroFrames += frames;
    return out;
}

let sileroMs = 0;
let sileroFrames = 0;

/** @type {Record<string, { tp: number, fp: number, fn: number, tn: number }>} */
const scores = {};
const add = (
    /** @type {string} */ key,
    /** @type {number[]} */ truth,
    /** @type {number[]} */ guess,
) => {
    const s = (scores[key] ??= { tp: 0, fp: 0, fn: 0, tn: 0 });
    truth.forEach((t, i) => {
        const g = guess[i] ?? 0;
        if (t && g) s.tp += 1;
        else if (!t && g) s.fp += 1;
        else if (t && !g) s.fn += 1;
        else s.tn += 1;
    });
};

for (const item of meta) {
    const samples = load(item.file);
    const frames = item.labels.length;
    const condition = item.noise === "clean" ? "clean" : `${item.noise} ${item.snr} dB`;
    let floor = 0;
    for (let end = WINDOW; end <= RATE; end += WINDOW)
        floor = Math.max(floor, rmsBefore(samples, end));
    add(`${condition} | energy (default)`, item.labels, energy(samples, 0.045, frames));
    add(
        `${condition} | energy (calibrated)`,
        item.labels,
        energy(samples, suggestGateThreshold(floor), frames),
    );
    add(`${condition} | silero`, item.labels, await silero(samples, frames));
}
await session.release();

console.log("condition | detector | accuracy | precision | recall");
for (const [key, s] of Object.entries(scores)) {
    const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)} %`;
    const accuracy = (s.tp + s.tn) / (s.tp + s.tn + s.fp + s.fn);
    console.log(
        `${key} | ${pct(accuracy)} | ${pct(s.tp / Math.max(1, s.tp + s.fp))} | ${pct(s.tp / Math.max(1, s.tp + s.fn))}`,
    );
}
console.log(
    `silero: ${(sileroMs / sileroFrames).toFixed(3)} ms per 32 ms frame (${sileroFrames} frames, onnxruntime-web WASM, 1 thread, Node ${process.versions.node})`,
);

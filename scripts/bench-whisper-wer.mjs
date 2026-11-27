#!/usr/bin/env node
// @ts-check

/**
 * Word error rate of on-device Whisper over a folder of recordings, in a real
 * Chromium, from the built `dist/speech.js`.
 *
 * The dataset is a folder with the audio files and a `transcripts.tsv` of
 * `file<TAB>reference text` lines — the shape a set of real recordings from an
 * app is easy to put in. Every file is transcribed with `loadWhisper` (WASM,
 * threads through COOP/COEP) and scored against its reference after the same
 * normalisation on both sides: lowercase, Unicode NFC, punctuation removed,
 * whitespace collapsed. Accents are kept — "à" and "a" are different words in
 * Portuguese, and a model that drops them is wrong.
 *
 * Usage:
 *
 *     npm run build
 *     WHISPER_MODEL_DIR=/tmp/whisper-base DATASET_DIR=/tmp/pt30 LANGUAGE=pt \
 *       node scripts/bench-whisper-wer.mjs
 *
 * Optional: `ISOLATION=0` drops COOP/COEP, so ONNX Runtime runs on one
 * thread — how an app without those headers runs it. `DTYPE` (default `int8`), `PROMPT` (vocabulary prompt passed to
 * every transcription), `VERBOSE=1` to print every hypothesis.
 */

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_DIR = process.env.WHISPER_MODEL_DIR;
const DATASET_DIR = process.env.DATASET_DIR;
const LANGUAGE = process.env.LANGUAGE ?? "pt";
const DTYPE = process.env.DTYPE ?? "int8";
const PROMPT = process.env.PROMPT;
if (!MODEL_DIR || !DATASET_DIR) {
    console.error("bench-whisper-wer: set WHISPER_MODEL_DIR and DATASET_DIR");
    process.exit(1);
}

/** @type {{ file: string, reference: string }[]} */
const items = readFileSync(join(DATASET_DIR, "transcripts.tsv"), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
        const [file = "", reference = ""] = line.split("\t");
        return { file, reference };
    });

/**
 * Normalise a transcript for scoring.
 *
 * @param {string} text Raw text.
 * @returns {string[]} Words.
 */
function words(text) {
    return text
        .normalize("NFC")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter(Boolean);
}

/**
 * Word-level Levenshtein distance.
 *
 * @param {string[]} reference Reference words.
 * @param {string[]} hypothesis Hypothesis words.
 * @returns {number} Substitutions + deletions + insertions.
 */
function editDistance(reference, hypothesis) {
    let previous = Array.from({ length: hypothesis.length + 1 }, (_, j) => j);
    for (let i = 1; i <= reference.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= hypothesis.length; j += 1) {
            const cost = reference[i - 1] === hypothesis[j - 1] ? 0 : 1;
            current[j] = Math.min(
                (previous[j] ?? 0) + 1,
                (current[j - 1] ?? 0) + 1,
                (previous[j - 1] ?? 0) + cost,
            );
        }
        previous = current;
    }
    return previous[hypothesis.length] ?? 0;
}

/** @type {Record<string, string>} */
const TYPES = {
    js: "text/javascript",
    mjs: "text/javascript",
    wasm: "application/wasm",
    json: "application/json",
};
const server = createServer((request, response) => {
    if (process.env.ISOLATION !== "0") {
        response.setHeader("cross-origin-opener-policy", "same-origin");
        response.setHeader("cross-origin-embedder-policy", "require-corp");
    }
    const path = decodeURIComponent((request.url ?? "/").split("?")[0] ?? "/");
    if (path === "/") {
        response.setHeader("content-type", "text/html");
        response.end(
            '<script type="importmap">{"imports":{"onnxruntime-web":"/ort/ort.bundle.min.mjs","fflate":"/fflate/esm/browser.js"}}</script>',
        );
        return;
    }
    let file = null;
    if (path.startsWith("/dist/")) file = join(ROOT, path);
    else if (path.startsWith("/ort/"))
        file = join(ROOT, "node_modules/onnxruntime-web/dist", path.slice(5));
    else if (path.startsWith("/fflate/")) file = join(ROOT, "node_modules/fflate", path.slice(8));
    else if (path.startsWith("/models/")) file = join(MODEL_DIR, path.slice(8));
    else if (path.startsWith("/data/")) file = join(DATASET_DIR, path.slice(6));
    if (!file || !existsSync(file)) {
        response.statusCode = 404;
        response.end();
        return;
    }
    const body = readFileSync(file);
    response.setHeader(
        "content-type",
        TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream",
    );
    response.setHeader("content-length", body.length);
    response.end(body);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`);
const runs = await page.evaluate(
    async ({ files, dtype, language, prompt }) => {
        const { loadWhisper } = await import("/dist/speech.js");
        const model = await loadWhisper({ baseUrl: "/models", dtype });
        const out = [];
        for (const file of files) {
            const audio = await (await fetch(`/data/${file}`)).blob();
            const result = await model.transcribe(audio, { language, prompt });
            out.push({
                file,
                text: result.text,
                audioMs: result.audioMs,
                totalMs: result.timings.totalMs,
                degenerate: result.degenerate,
            });
        }
        await model.release();
        return out;
    },
    { files: items.map((item) => item.file), dtype: DTYPE, language: LANGUAGE, prompt: PROMPT },
);
await browser.close();
server.close();

let errors = 0;
let referenceWords = 0;
let audioMs = 0;
let computeMs = 0;
let degenerate = 0;
for (const [index, run] of runs.entries()) {
    const reference = words(items[index]?.reference ?? "");
    const hypothesis = words(run.text);
    const distance = editDistance(reference, hypothesis);
    errors += distance;
    referenceWords += reference.length;
    audioMs += run.audioMs;
    computeMs += run.totalMs;
    if (run.degenerate) degenerate += 1;
    if (process.env.VERBOSE) {
        console.log(`${(distance / reference.length).toFixed(2)}  ${run.file}`);
        console.log(`   ref: ${items[index]?.reference}`);
        console.log(`   hyp: ${run.text}`);
    }
}
console.log(
    `bench-whisper-wer: ${MODEL_DIR.split("/").pop()} ${DTYPE}, ${runs.length} files, ${(audioMs / 1000).toFixed(0)} s of audio, Chromium ${browser.version()}`,
);
console.log(`  prompt      ${PROMPT ? JSON.stringify(PROMPT) : "(none)"}`);
console.log(
    `  WER         ${((errors / referenceWords) * 100).toFixed(1)} % (${errors}/${referenceWords} words)`,
);
console.log(
    `  compute     ${(computeMs / 1000).toFixed(1)} s, real-time factor ${(computeMs / audioMs).toFixed(3)}`,
);
console.log(`  degenerate  ${degenerate}`);

#!/usr/bin/env node
// @ts-check

/**
 * Measure on-device Whisper in a real Chromium, from the built `dist/speech.js`.
 *
 * Serves the page with COOP/COEP (so ONNX Runtime Web gets threads), resolves
 * `onnxruntime-web` and `fflate` through an import map to the installed
 * packages, loads the model with `loadWhisper`, and transcribes
 * `$WHISPER_MODEL_DIR/jfk.flac` twice (the second run is the warm number).
 * Prints load time (download and from cache), every stage of
 * `Transcription.timings`, the transcript and whether it is degenerate.
 *
 * Usage (download command in `e2e/speech-whisper.spec.ts`):
 *
 *     npm run build
 *     WHISPER_MODEL_DIR=/tmp/whisper-tiny node scripts/bench-whisper.mjs
 *     WHISPER_MODEL_DIR=/tmp/whisper-tiny DTYPE=fp16 PROVIDERS=webgpu,wasm node scripts/bench-whisper.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_DIR = process.env.WHISPER_MODEL_DIR;
const DTYPE = process.env.DTYPE ?? "int8";
const PROVIDERS = (process.env.PROVIDERS ?? "wasm").split(",");
const LANGUAGE = process.env.LANGUAGE ?? "en";
if (!MODEL_DIR) {
    console.error("bench-whisper: set WHISPER_MODEL_DIR (see e2e/speech-whisper.spec.ts)");
    process.exit(1);
}

/** @type {Record<string, string>} */
const TYPES = {
    js: "text/javascript",
    mjs: "text/javascript",
    wasm: "application/wasm",
    json: "application/json",
};
const server = createServer((request, response) => {
    response.setHeader("cross-origin-opener-policy", "same-origin");
    response.setHeader("cross-origin-embedder-policy", "require-corp");
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

const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu"] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`);
const result = await page.evaluate(
    async ({ dtype, providers, language }) => {
        const { loadWhisper, assessSpeechDevice } = await import("/dist/speech.js");
        const audio = await (await fetch("/models/jfk.flac")).blob();
        let downloaded = 0;
        let started = performance.now();
        const model = await loadWhisper({
            baseUrl: "/models",
            dtype,
            providers,
            onProgress: (/** @type {{loaded: number, total: number | null}} */ p) => {
                if (p.total && p.loaded === p.total) downloaded += p.total;
            },
        });
        const loadMs = performance.now() - started;
        await model.transcribe(audio, { language });
        const warm = await model.transcribe(audio, { language });
        await model.release();
        started = performance.now();
        await (await loadWhisper({ baseUrl: "/models", dtype, providers })).release();
        const cachedLoadMs = performance.now() - started;
        return {
            device: assessSpeechDevice(),
            downloadedMb: downloaded / 1e6,
            loadMs,
            cachedLoadMs,
            audioMs: warm.audioMs,
            timings: warm.timings,
            tokens: warm.tokens.length,
            degenerate: warm.degenerate,
            text: warm.text,
        };
    },
    { dtype: DTYPE, providers: PROVIDERS, language: LANGUAGE },
);
await browser.close();
server.close();

const ms = (/** @type {number} */ value) => `${Math.round(value)} ms`;
console.log(`bench-whisper: ${DTYPE} on ${PROVIDERS.join("+")}, Chromium ${browser.version()}`);
console.log(
    `  device      threads=${result.device.wasmThreads} webgpu=${result.device.webgpu} cores=${result.device.hardwareConcurrency}`,
);
console.log(
    `  load        ${ms(result.loadMs)} (${result.downloadedMb.toFixed(1)} MB), from cache ${ms(result.cachedLoadMs)}`,
);
for (const [stage, value] of Object.entries(result.timings))
    console.log(`  ${stage.padEnd(11)} ${ms(value)}`);
console.log(
    `  audio       ${ms(result.audioMs)}, ${result.tokens} tokens, degenerate=${result.degenerate}`,
);
console.log(`  text        ${result.text}`);

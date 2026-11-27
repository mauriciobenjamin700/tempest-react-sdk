#!/usr/bin/env node
// @ts-check

/**
 * How much on-device Whisper freezes the page, with and without a worker, in
 * a real Chromium, from the built `dist/speech.js`.
 *
 * Bundles a one-line worker (`exposeWhisperWorker()`) with esbuild, the way an
 * app's bundler would, then transcribes `$WHISPER_MODEL_DIR/jfk.flac` on the
 * page and in the worker, counting `requestAnimationFrame` callbacks during
 * the warm run against the ~60 per second a free main thread draws.
 *
 * Usage (download command in `e2e/speech-whisper.spec.ts`):
 *
 *     npm run build
 *     WHISPER_MODEL_DIR=/tmp/whisper-tiny node scripts/bench-whisper-worker.mjs
 *     WHISPER_MODEL_DIR=/tmp/whisper-tiny ISOLATION=0 node scripts/bench-whisper-worker.mjs   # one thread
 */

import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { build } from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_DIR = process.env.WHISPER_MODEL_DIR;
if (!MODEL_DIR) {
    console.error("bench-whisper-worker: set WHISPER_MODEL_DIR (see e2e/speech-whisper.spec.ts)");
    process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "whisper-worker-"));
mkdirSync(join(work, "node_modules"));
symlinkSync(ROOT, join(work, "node_modules", "tempest-react-sdk"));
for (const dep of ["onnxruntime-web", "fflate"]) {
    symlinkSync(join(ROOT, "node_modules", dep), join(work, "node_modules", dep));
}
writeFileSync(
    join(work, "worker-entry.js"),
    'import { exposeWhisperWorker } from "tempest-react-sdk/speech";\nexposeWhisperWorker();\n',
);
await build({
    entryPoints: [join(work, "worker-entry.js")],
    bundle: true,
    format: "esm",
    outfile: join(work, "worker.js"),
    logLevel: "warning",
});

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
    if (path === "/worker.js") file = join(work, "worker.js");
    else if (path.startsWith("/dist/")) file = join(ROOT, path);
    else if (path.startsWith("/ort/"))
        file = join(ROOT, "node_modules/onnxruntime-web/dist", path.slice(5));
    else if (path.startsWith("/fflate/")) file = join(ROOT, "node_modules/fflate", path.slice(8));
    else if (path.startsWith("/models/")) file = join(MODEL_DIR, path.slice(8));
    if (!file || !existsSync(file)) {
        response.statusCode = 404;
        response.end();
        return;
    }
    response.setHeader(
        "content-type",
        TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream",
    );
    response.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
const address = server.address();
const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

const browser = await chromium.launch();
for (const mode of ["page", "worker"]) {
    const page = await browser.newPage();
    await page.goto(`${origin}/`);
    const result = await page.evaluate(async (mode) => {
        const { loadWhisper } = await import("/dist/speech.js");
        const audio = await (await fetch("/models/jfk.flac")).blob();
        const worker = mode === "worker" ? new Worker("/worker.js", { type: "module" }) : undefined;
        const model = await loadWhisper({
            baseUrl: `${location.origin}/models`,
            ortAssetsUrl: `${location.origin}/ort/`,
            worker,
            cacheName: mode,
        });
        await model.transcribe(audio, { language: "en" });
        let frames = 0;
        let live = true;
        const tick = () => {
            frames += 1;
            if (live) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        const started = performance.now();
        const transcription = await model.transcribe(audio, { language: "en" });
        const totalMs = performance.now() - started;
        live = false;
        await model.release();
        return { totalMs, frames, expected: totalMs / (1000 / 60), text: transcription.text };
    }, mode);
    console.log(
        `bench-whisper-worker: ${mode.padEnd(6)} ${Math.round(result.totalMs)} ms, ` +
            `${result.frames} frames drawn of ~${Math.round(result.expected)} at 60 fps — ${result.text.slice(0, 40)}…`,
    );
    await page.close();
}
await browser.close();
server.close();

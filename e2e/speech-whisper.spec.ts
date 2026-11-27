/**
 * Whisper on the device, in a real browser, from the built `dist/speech.js`.
 *
 * Opt-in: the model is tens of megabytes and does not belong in the repo.
 * Download whisper-tiny's int8 export once and point the spec at it:
 *
 *     M=/tmp/whisper-tiny && mkdir -p $M/onnx && for f in config.json \
 *       generation_config.json tokenizer.json onnx/encoder_model_int8.onnx \
 *       onnx/decoder_model_merged_int8.onnx; do curl -sfL -o $M/$f \
 *       "https://huggingface.co/onnx-community/whisper-tiny/resolve/main/$f"; done
 *     curl -sfL -o $M/jfk.flac https://raw.githubusercontent.com/openai/whisper/main/tests/jfk.flac
 *     npm run build && WHISPER_MODEL_DIR=$M npx playwright test e2e/speech-whisper.spec.ts
 *
 * Served by its own server, with COOP/COEP so ONNX Runtime gets threads, and
 * an import map resolving `onnxruntime-web` to the installed peer — the shape
 * an app ships, not a test double.
 */

import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const MODEL_DIR = process.env.WHISPER_MODEL_DIR;
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TYPES: Record<string, string> = {
    js: "text/javascript",
    mjs: "text/javascript",
    wasm: "application/wasm",
    json: "application/json",
};

/**
 * Start the page server.
 *
 * @param modelDir Folder with the export and `jfk.flac`.
 * @returns The server and its origin.
 */
async function serve(modelDir: string): Promise<{ server: Server; origin: string }> {
    const server = createServer((request, response) => {
        response.setHeader("cross-origin-opener-policy", "same-origin");
        response.setHeader("cross-origin-embedder-policy", "require-corp");
        const path = decodeURIComponent((request.url ?? "/").split("?")[0] as string);
        if (path === "/") {
            response.setHeader("content-type", "text/html");
            response.end(
                '<script type="importmap">{"imports":{"onnxruntime-web":"/ort/ort.bundle.min.mjs","fflate":"/fflate/esm/browser.js"}}</script>',
            );
            return;
        }
        let file: string | null = null;
        if (path.startsWith("/dist/")) file = `${ROOT}${path}`;
        else if (path.startsWith("/ort/"))
            file = `${ROOT}node_modules/onnxruntime-web/dist/${path.slice(5)}`;
        else if (path.startsWith("/fflate/")) file = `${ROOT}node_modules/fflate/${path.slice(8)}`;
        else if (path.startsWith("/models/")) file = `${modelDir}/${path.slice(8)}`;
        if (!file || !existsSync(file)) {
            response.statusCode = 404;
            response.end();
            return;
        }
        const body = readFileSync(file);
        response.setHeader(
            "content-type",
            TYPES[file.split(".").pop() as string] ?? "application/octet-stream",
        );
        response.setHeader("content-length", body.length);
        response.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

test.describe("Whisper on the device", () => {
    test.skip(!MODEL_DIR, "set WHISPER_MODEL_DIR to a whisper-tiny ONNX export (see the header)");

    test("transcribes a real recording word for word and answers from the device", async ({
        page,
    }) => {
        const { server, origin } = await serve(MODEL_DIR as string);
        await page.goto(`${origin}/`);
        const result = await page.evaluate(async () => {
            const { createSpeechToText, loadWhisper } = await import("/dist/speech.js");
            const audio = await (await fetch("/models/jfk.flac")).blob();
            const speech = createSpeechToText({
                loadModel: () => loadWhisper({ baseUrl: "/models" }),
                server: async () => "from the server",
                language: "en",
                whileLoading: "wait",
                storage: null,
            });
            const answer = await speech.transcribe(audio);
            await speech.release();
            return {
                text: answer.text,
                source: answer.source,
                degenerate: answer.transcription?.degenerate,
                audioMs: answer.transcription?.audioMs,
                totalMs: answer.transcription?.timings.totalMs,
            };
        });
        server.close();
        expect(result.source).toBe("device");
        expect(result.degenerate).toBe(false);
        expect(result.text).toBe(
            "And so my fellow Americans ask not what your country can do for you, ask what you can do for your country.",
        );
        expect(result.totalMs).toBeLessThan(result.audioMs as number);
    });
});

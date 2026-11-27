/**
 * PCM for audio models, in a real browser: decoding a `MediaRecorder` file
 * and streaming a live node through the `AudioWorklet`.
 *
 * jsdom has no Web Audio, so the unit tests run the worklet's source against
 * stand-ins; this spec is what proves the module loads from a `blob:` URL,
 * that the browser's decoder plus the SDK's resampler land on the right
 * length and pitch, and that the live path neither drops nor repeats frames.
 */

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

/** Serve `dist/audio/*` from the repo through the page's origin. */
async function serveAudioDist(page: Page): Promise<void> {
    await page.route("**/audio-dist/**", (route) => {
        const url = new URL(route.request().url());
        const name = url.pathname.split("/audio-dist/")[1] as string;
        const path = fileURLToPath(new URL(`../dist/audio/${name}`, import.meta.url));
        route.fulfill({
            status: 200,
            contentType: "text/javascript",
            body: readFileSync(path, "utf8"),
        });
    });
}

test.describe("audio PCM for models", () => {
    test.beforeEach(async ({ page }) => {
        await serveAudioDist(page);
        await page.goto("/");
    });

    test("decodes a MediaRecorder recording to 16 kHz mono at the recorded pitch", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const { decodeAudioToPcm } = await import("/audio-dist/decode-pcm.js");
            const context = new AudioContext();
            const oscillator = context.createOscillator();
            oscillator.frequency.value = 440;
            const destination = context.createMediaStreamDestination();
            oscillator.connect(destination);
            oscillator.start();
            const recorder = new MediaRecorder(destination.stream);
            const chunks: Blob[] = [];
            recorder.ondataavailable = (event) => chunks.push(event.data);
            recorder.start();
            await new Promise((resolve) => setTimeout(resolve, 1500));
            recorder.stop();
            await new Promise((resolve) => (recorder.onstop = resolve));
            oscillator.stop();
            const blob = new Blob(chunks, { type: recorder.mimeType });
            const pcm = await decodeAudioToPcm(blob, { sampleRate: 16_000 });
            const body = pcm.samples.subarray(1600, pcm.samples.length - 1600);
            let crossings = 0;
            for (let i = 1; i < body.length; i += 1) {
                if ((body[i - 1] as number) < 0 && (body[i] as number) >= 0) crossings += 1;
            }
            return {
                rate: pcm.sampleRate,
                seconds: pcm.samples.length / pcm.sampleRate,
                hz: crossings / (body.length / 16_000),
                mime: recorder.mimeType,
            };
        });
        expect(result.rate).toBe(16_000);
        expect(result.seconds).toBeGreaterThan(1.2);
        expect(result.seconds).toBeLessThan(1.8);
        expect(Math.abs(result.hz - 440)).toBeLessThan(5);
    });

    test("streams a live node as 512-sample frames without losing or repeating any", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const { createPcmStream } = await import("/audio-dist/pcm-stream.js");
            const context = new AudioContext();
            await context.resume();
            const oscillator = context.createOscillator();
            oscillator.frequency.value = 1000;
            const gain = context.createGain();
            gain.gain.value = 0.5;
            oscillator.connect(gain);
            const frames: Float32Array[] = [];
            const stream = await createPcmStream(gain, {
                sampleRate: 16_000,
                frameSize: 512,
                onFrame: (frame: Float32Array) => frames.push(frame),
            });
            oscillator.start();
            const startedAt = context.currentTime;
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const elapsed = context.currentTime - startedAt;
            stream.release();
            oscillator.stop();
            const steady = frames.slice(5, -1);
            let sum = 0;
            let crossings = 0;
            let count = 0;
            for (const frame of steady) {
                for (let i = 0; i < frame.length; i += 1) {
                    const x = frame[i] as number;
                    sum += x * x;
                    count += 1;
                    if (i > 0 && (frame[i - 1] as number) < 0 && x >= 0) crossings += 1;
                }
            }
            return {
                contextRate: context.sampleRate,
                frames: frames.length,
                expected: (elapsed * 16_000) / 512,
                rms: Math.sqrt(sum / count),
                hz: crossings / (count / 16_000),
            };
        });
        expect(Math.abs(result.frames - result.expected)).toBeLessThanOrEqual(3);
        expect(result.rms).toBeGreaterThan(0.34);
        expect(result.rms).toBeLessThan(0.37);
        expect(Math.abs(result.hz - 1000)).toBeLessThan(10);
    });

    test("under the CSP tempestCsp() generates, names the fix and runs from the shipped worklet file", async ({
        page,
    }) => {
        const dist = fileURLToPath(new URL("../dist/", import.meta.url));
        const server = createServer((request, response) => {
            const path = request.url ?? "/";
            if (path === "/csp-audio.html") {
                response.setHeader(
                    "content-security-policy",
                    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'; worker-src 'self' blob:",
                );
                response.setHeader("content-type", "text/html");
                response.end("<!doctype html><title>csp</title>");
                return;
            }
            const file =
                path === "/pcm-worklet.js"
                    ? "pcm-worklet.js"
                    : path.replace("/audio-dist/", "audio/");
            response.setHeader("content-type", "text/javascript");
            response.end(readFileSync(`${dist}${file}`, "utf8"));
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const { port } = server.address() as AddressInfo;
        await page.unrouteAll();
        await page.goto(`http://127.0.0.1:${port}/csp-audio.html`);
        const result = await page.evaluate(async () => {
            const { createPcmStream } = await import("/audio-dist/pcm-stream.js");
            const context = new AudioContext();
            const oscillator = context.createOscillator();
            let inline = "loaded";
            try {
                await createPcmStream(oscillator, { onFrame: () => undefined });
            } catch (error) {
                inline = (error as Error).message;
            }
            const frames: number[] = [];
            const stream = await createPcmStream(oscillator, {
                workletUrl: "/pcm-worklet.js",
                onFrame: (frame: Float32Array) => frames.push(frame.length),
            });
            oscillator.start();
            await context.resume();
            await new Promise((resolve) => setTimeout(resolve, 500));
            stream.release();
            oscillator.stop();
            return { inline, frames: frames.length };
        });
        server.close();
        expect(result.inline).toMatch(/script-src.*pcm-worklet\.js\?url/s);
        expect(result.frames).toBeGreaterThan(5);
    });
});

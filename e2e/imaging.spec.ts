/**
 * Real-browser tests for `tempest-react-sdk/imaging`.
 *
 * jsdom has no canvas, no `createImageBitmap` and no image encoders, so
 * every claim this module makes — EXIF orientation, anti-aliased downscale,
 * format support, byte budgets — can only be checked in a browser. These
 * run against the built `dist/`, served through a route handler, so what is
 * tested is what ships.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

/** Serve `dist/imaging/*` from the repo through the page's origin. */
async function serveImagingDist(page: Page): Promise<void> {
    await page.route("**/imaging-dist/**", (route) => {
        const url = new URL(route.request().url());
        const name = url.pathname.split("/imaging-dist/")[1] as string;
        const path = fileURLToPath(new URL(`../dist/imaging/${name}`, import.meta.url));
        route.fulfill({
            status: 200,
            contentType: "text/javascript",
            body: readFileSync(path, "utf8"),
        });
    });
}

/**
 * Helpers injected into the page: image generators, an EXIF writer, and a video.
 *
 * The EXIF writer exists because the orientation claim cannot be tested
 * with a canvas-produced JPEG — canvases never write an orientation tag,
 * and phones always do.
 *
 * `makeBandedVideo` records a canvas whose colour says which second it came
 * from, and it repaints every animation frame rather than once per band:
 * `captureStream(30)` does **not** synthesize frames at 30 fps, it emits one
 * when the canvas changes. Painting once a second produced a ~1 fps video whose
 * frames arrive 700 ms apart (measured), which is a bad stand-in for anything
 * an app captures from — repainting per animation frame gives ~59 fps, which is
 * what a real recording looks like.
 */
const PAGE_HELPERS = `
window.makeCheckerboard = async (size, cell) => {
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d");
    for (let y = 0; y < size; y += cell) {
        for (let x = 0; x < size; x += cell) {
            context.fillStyle = ((x / cell + y / cell) % 2 === 0) ? "#000000" : "#ffffff";
            context.fillRect(x, y, cell, cell);
        }
    }
    return await canvas.convertToBlob({ type: "image/png" });
};

window.makePhotoish = async (width, height) => {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    for (let i = 0; i < 4000; i += 1) {
        context.fillStyle = "rgb(" + ((i * 7) % 256) + "," + ((i * 13) % 256) + "," + ((i * 29) % 256) + ")";
        context.fillRect((i * 37) % width, (i * 53) % height, 40, 40);
    }
    return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 });
};

/** Build a landscape JPEG carrying EXIF Orientation=6 (rotate 90 CW). */
window.makeRotatedJpeg = async (width, height) => {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#0000ff";
    context.fillRect(0, 0, width / 2, height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const exif = new Uint8Array([
        0xff, 0xe1, 0x00, 0x22,
        0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00,
        0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
    ]);
    const out = new Uint8Array(bytes.length + exif.length);
    out.set(bytes.subarray(0, 2), 0);
    out.set(exif, 2);
    out.set(bytes.subarray(2), 2 + exif.length);
    return new Blob([out], { type: "image/jpeg" });
};

window.pixelStats = async (blob) => {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let sum = 0;
    const values = [];
    for (let i = 0; i < data.length; i += 4) {
        values.push(data[i]);
        sum += data[i];
    }
    const mean = sum / values.length;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
    return { mean, stdDev: Math.sqrt(variance), width: bitmap.width, height: bitmap.height };
};

window.firstPixel = async (blob) => {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, 1, 1);
    return { r: data[0], g: data[1], b: data[2], a: data[3] };
};
window.makeBandedVideo = async (bands) => {
    const COLORS = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

    const started = performance.now();
    recorder.start();
    while (performance.now() - started < bands * 1000) {
        const band = Math.min(bands - 1, Math.floor((performance.now() - started) / 1000));
        context.fillStyle = COLORS[band % COLORS.length];
        context.fillRect(0, 0, 64, 64);
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }
    recorder.stop();
    await stopped;
    for (const track of stream.getTracks()) track.stop();

    return { url: URL.createObjectURL(new Blob(chunks, { type: "video/webm" })), colors: COLORS };
};

window.loadVideo = async (url) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = url;
    document.body.append(video);
    await new Promise((resolve, reject) => {
        video.addEventListener("loadeddata", resolve, { once: true });
        video.addEventListener("error", () => reject(new Error("the video did not load")), { once: true });
    });
    return video;
};

window.bandOf = async (blob) => {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1);
    const hit = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]].findIndex(
        ([r, g, b]) => Math.abs(data[0] - r) < 40 && Math.abs(data[1] - g) < 40 && Math.abs(data[2] - b) < 40,
    );
    return { band: hit, rgb: [data[0], data[1], data[2]] };
};
`;

test.beforeEach(async ({ page }) => {
    await serveImagingDist(page);
    await page.goto("/");
    await page.addScriptTag({ content: PAGE_HELPERS });
});

test("decodes a phone photo upright, honouring EXIF orientation", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const { decodeImage } = await import("/imaging-dist/decode.js");
        const blob = await (
            window as never as { makeRotatedJpeg: (w: number, h: number) => Promise<Blob> }
        ).makeRotatedJpeg(120, 60);
        const decoded = await decodeImage(blob);
        return { width: decoded.width, height: decoded.height };
    });

    expect(result.width).toBe(60);
    expect(result.height).toBe(120);
});

test("a steep downscale averages its source instead of sampling it", async ({ page }) => {
    const measured = await page.evaluate(async () => {
        const { resizeImage } = await import("/imaging-dist/transform.js");
        const helpers = window as never as {
            makeCheckerboard: (s: number, c: number) => Promise<Blob>;
        };
        const source = await helpers.makeCheckerboard(512, 2);

        const stepwise = await resizeImage(source, { width: 32, type: "image/png" });
        const stats = await (
            window as never as { pixelStats: (b: Blob) => Promise<{ stdDev: number }> }
        ).pixelStats(stepwise.blob);

        const canvas = new OffscreenCanvas(32, 32);
        const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(await createImageBitmap(source), 0, 0, 32, 32);
        const naiveBlob = await canvas.convertToBlob({ type: "image/png" });
        const naive = await (
            window as never as { pixelStats: (b: Blob) => Promise<{ stdDev: number }> }
        ).pixelStats(naiveBlob);

        return { stepwise: stats.stdDev, naive: naive.stdDev };
    });

    // A 2 px checkerboard reduced 16x must average to flat grey. Any spread
    // is aliasing. Measured 0.0 here and for a bare high-quality drawImage,
    // which is why the stepwise halving was removed — see canvas.ts.
    expect(measured.stepwise).toBeLessThan(1);
    expect(measured.naive).toBeLessThan(1);
});

test("reports the format it actually produced", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const { resizeImage } = await import("/imaging-dist/transform.js");
        const { supportsImageType, bestSupportedType } = await import("/imaging-dist/encode.js");
        const source = await (
            window as never as { makePhotoish: (w: number, h: number) => Promise<Blob> }
        ).makePhotoish(400, 300);

        const webp = await resizeImage(source, { width: 200, type: "image/webp" });
        return {
            webpSupported: await supportsImageType("image/webp"),
            jpegSupported: await supportsImageType("image/jpeg"),
            avifSupported: await supportsImageType("image/avif"),
            producedType: webp.type,
            best: await bestSupportedType(["image/avif", "image/webp", "image/jpeg"]),
        };
    });

    expect(result.jpegSupported).toBe(true);
    expect(result.webpSupported).toBe(true);
    expect(result.producedType).toBe("image/webp");
    expect(["image/avif", "image/webp"]).toContain(result.best);
});

test("fits an image into a byte budget", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const { compressToTarget } = await import("/imaging-dist/compress.js");
        const source = await (
            window as never as { makePhotoish: (w: number, h: number) => Promise<Blob> }
        ).makePhotoish(2000, 1500);

        const fitting = await compressToTarget(source, {
            maxBytes: 400_000,
            width: 1200,
            type: "image/jpeg",
        });
        const impossible = await compressToTarget(source, {
            maxBytes: 2_000,
            width: 1200,
            type: "image/jpeg",
        });

        return {
            original: source.size,
            fitting: {
                bytes: fitting.bytes,
                width: fitting.width,
                attempts: fitting.attempts,
                withinBudget: fitting.withinBudget,
            },
            impossible: {
                bytes: impossible.bytes,
                quality: impossible.quality,
                withinBudget: impossible.withinBudget,
            },
        };
    });

    expect(result.original).toBeGreaterThan(400_000);
    expect(result.fitting.withinBudget).toBe(true);
    expect(result.fitting.bytes).toBeLessThanOrEqual(400_000);
    expect(result.fitting.width).toBe(1200);
    expect(result.fitting.attempts).toBeLessThanOrEqual(8);

    // A budget the picture cannot reach is reported, not thrown: 2.1 MB against
    // a 2 MB budget is usually still worth uploading, and that call is the app's.
    expect(result.impossible.withinBudget).toBe(false);
    expect(result.impossible.quality).toBeCloseTo(0.4, 5);
});

test("keeps the aspect ratio per fit mode", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const { resizeImage } = await import("/imaging-dist/transform.js");
        const source = await (
            window as never as { makePhotoish: (w: number, h: number) => Promise<Blob> }
        ).makePhotoish(400, 200);

        const contain = await resizeImage(source, { width: 100, height: 100, fit: "contain" });
        const cover = await resizeImage(source, { width: 100, height: 100, fit: "cover" });
        const fill = await resizeImage(source, { width: 100, height: 100, fit: "fill" });
        const pad = await resizeImage(source, { width: 100, height: 100, fit: "pad" });

        return {
            contain: [contain.width, contain.height],
            cover: [cover.width, cover.height],
            fill: [fill.width, fill.height],
            pad: [pad.width, pad.height],
        };
    });

    expect(result.contain).toEqual([100, 50]);
    expect(result.cover).toEqual([100, 100]);
    expect(result.fill).toEqual([100, 100]);
    expect(result.pad).toEqual([100, 100]);
});

test("never enlarges unless asked", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const { resizeImage } = await import("/imaging-dist/transform.js");
        const source = await (
            window as never as { makePhotoish: (w: number, h: number) => Promise<Blob> }
        ).makePhotoish(100, 100);

        const clamped = await resizeImage(source, { width: 500 });
        const enlarged = await resizeImage(source, { width: 500, withoutEnlargement: false });
        return { clamped: clamped.width, enlarged: enlarged.width };
    });

    expect(result.clamped).toBe(100);
    expect(result.enlarged).toBe(500);
});

test("paints a background instead of black where JPEG has no alpha", async ({ page }) => {
    const pixel = await page.evaluate(async () => {
        const { resizeImage } = await import("/imaging-dist/transform.js");
        const canvas = new OffscreenCanvas(50, 50);
        canvas.getContext("2d");
        const transparent = await canvas.convertToBlob({ type: "image/png" });

        const jpeg = await resizeImage(transparent, { width: 20, type: "image/jpeg" });
        return await (
            window as never as { firstPixel: (b: Blob) => Promise<{ r: number }> }
        ).firstPixel(jpeg.blob);
    });

    expect(pixel.r).toBeGreaterThan(240);
});

test("crops, rotates and flips in source pixels", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const { cropImage, rotateImage, flipImage } = await import("/imaging-dist/transform.js");
        const source = await (
            window as never as { makePhotoish: (w: number, h: number) => Promise<Blob> }
        ).makePhotoish(400, 200);

        const cropped = await cropImage(source, { x: 10, y: 10, width: 100, height: 50 });
        const clamped = await cropImage(source, { x: 380, y: 0, width: 100, height: 100 });
        const rotated = await rotateImage(source, 90);
        const flipped = await flipImage(source, { horizontal: true });

        return {
            cropped: [cropped.width, cropped.height],
            clamped: [clamped.width, clamped.height],
            rotated: [rotated.width, rotated.height],
            flipped: [flipped.width, flipped.height],
        };
    });

    expect(result.cropped).toEqual([100, 50]);
    expect(result.clamped).toEqual([20, 100]);
    expect(result.rotated).toEqual([200, 400]);
    expect(result.flipped).toEqual([400, 200]);
});

test("produces every thumbnail size from one decode", async ({ page }) => {
    const sizes = await page.evaluate(async () => {
        const { createThumbnails } = await import("/imaging-dist/thumbnails.js");
        const source = await (
            window as never as { makePhotoish: (w: number, h: number) => Promise<Blob> }
        ).makePhotoish(800, 400);

        const produced = await createThumbnails(
            source,
            [
                { name: "thumb", size: 96 },
                { name: "card", size: 320 },
            ],
            { type: "image/webp" },
        );
        return produced.map((entry) => [entry.name, entry.width, entry.height, entry.type]);
    });

    expect(sizes).toEqual([
        ["thumb", 96, 48, "image/webp"],
        ["card", 320, 160, "image/webp"],
    ]);
});

test("re-encoding drops the EXIF a photo arrived with", async ({ page }) => {
    const result = await page.evaluate(async () => {
        const { resizeImage } = await import("/imaging-dist/transform.js");
        const withExif = await (
            window as never as { makeRotatedJpeg: (w: number, h: number) => Promise<Blob> }
        ).makeRotatedJpeg(120, 60);

        const before = new Uint8Array(await withExif.arrayBuffer());
        const resized = await resizeImage(withExif, { width: 60, type: "image/jpeg" });
        const after = new Uint8Array(await resized.blob.arrayBuffer());

        const findExif = (bytes: Uint8Array): boolean => {
            for (let i = 0; i < bytes.length - 5; i += 1) {
                if (
                    bytes[i] === 0x45 &&
                    bytes[i + 1] === 0x78 &&
                    bytes[i + 2] === 0x69 &&
                    bytes[i + 3] === 0x66
                ) {
                    return true;
                }
            }
            return false;
        };

        return { before: findExif(before), after: findExif(after) };
    });

    expect(result.before).toBe(true);
    expect(result.after).toBe(false);
});

/**
 * `captureFrame` against a real decoder.
 *
 * The video is produced in the page by recording a canvas that changes colour
 * once a second, so a captured frame carries which second it came from — and
 * being a `MediaRecorder` blob it also arrives with **no duration in its
 * header**, which is the case an app hits first and the reason the capture
 * probes for one.
 *
 * What this cannot pin, and no test in this repo does yet: that a capture lands
 * on the exact frame rather than its neighbour. The bands are one second wide
 * because `MediaRecorder` from `captureStream` gives no frame-accurate
 * timestamps to build narrower ones from — a committed asset with known frame
 * times is what that would take.
 */
test.describe("captureFrame", () => {
    test("reads the frame the video is showing, without moving it", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const api = window as never as {
                makeBandedVideo: (bands: number) => Promise<{ url: string }>;
                loadVideo: (url: string) => Promise<HTMLVideoElement>;
                bandOf: (blob: Blob) => Promise<{ band: number; rgb: number[] }>;
            };
            const { captureFrame } = await import("/imaging-dist/frame.js");
            const { url } = await api.makeBandedVideo(3);
            const video = await api.loadVideo(url);

            const shot = await captureFrame(video, { type: "image/png" });
            const read = await api.bandOf(shot.blob);
            return {
                band: read.band,
                rgb: read.rgb,
                type: shot.type,
                width: shot.width,
                atMs: shot.atMs,
                currentTime: video.currentTime,
            };
        });

        expect(result.type).toBe("image/png");
        expect(result.width).toBe(64);
        expect(result.atMs).toBe(0);
        expect(result.currentTime).toBe(0);
        expect(result.band, `centre pixel was rgb(${result.rgb.join(",")})`).toBe(0);
    });

    test("seeks to an instant and captures that instant's band", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const api = window as never as {
                makeBandedVideo: (bands: number) => Promise<{ url: string }>;
                loadVideo: (url: string) => Promise<HTMLVideoElement>;
                bandOf: (blob: Blob) => Promise<{ band: number; rgb: number[] }>;
            };
            const { captureFrame } = await import("/imaging-dist/frame.js");
            const { url } = await api.makeBandedVideo(4);
            const video = await api.loadVideo(url);
            const headerDuration = video.duration;

            const shot = await captureFrame(video, { atMs: 2_500, type: "image/png" });
            const read = await api.bandOf(shot.blob);
            return {
                headerDuration,
                probedDuration: video.duration,
                band: read.band,
                rgb: read.rgb,
                atMs: shot.atMs,
                confirmed: shot.confirmed,
                restoredTo: video.currentTime,
            };
        });

        /**
         * Measured here, 2026-09-04: Chromium reported `3.000197` for a
         * one-shot `MediaRecorder` blob — it **does** write a duration for a
         * recording finalised in a single `stop()`. So the probe does not run
         * on this path, and asserting `Infinity` would be asserting a browser
         * bug that this browser does not have. The browsers and the chunked
         * `timeslice` paths that omit the duration are covered in
         * `src/imaging/frame.test.ts`, where the value is controlled.
         */
        expect(Number.isFinite(result.probedDuration)).toBe(true);
        expect(result.probedDuration).toBeGreaterThan(2);
        expect(result.atMs).toBeGreaterThan(2_000);
        expect(result.atMs).toBeLessThan(3_000);
        expect(
            result.confirmed,
            "a paused seek cannot be confirmed — measured, see the note above",
        ).toBe(false);
        expect(result.band, `centre pixel was rgb(${result.rgb.join(",")})`).toBe(2);
        expect(result.restoredTo).toBe(0);
    });

    test("leaves the player on the captured frame when told not to restore", async ({ page }) => {
        const parked = await page.evaluate(async () => {
            const api = window as never as {
                makeBandedVideo: (bands: number) => Promise<{ url: string }>;
                loadVideo: (url: string) => Promise<HTMLVideoElement>;
            };
            const { captureFrame } = await import("/imaging-dist/frame.js");
            const { url } = await api.makeBandedVideo(3);
            const video = await api.loadVideo(url);

            await captureFrame(video, { atMs: 1_500, restore: false, type: "image/png" });
            return video.currentTime;
        });

        expect(parked).toBeGreaterThan(1);
    });

    /**
     * The other half of the measurement: while the video **plays**, the frame
     * callback does fire, so a print of a running recording is confirmed. This
     * is the assertion that would go red if the confirmation were wired to the
     * wrong state.
     */
    test("confirms the frame when the video is playing", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const api = window as never as {
                makeBandedVideo: (bands: number) => Promise<{ url: string }>;
                loadVideo: (url: string) => Promise<HTMLVideoElement>;
            };
            const { captureFrame } = await import("/imaging-dist/frame.js");
            const { url } = await api.makeBandedVideo(3);
            const video = await api.loadVideo(url);
            video.loop = true;
            await video.play();

            const shot = await captureFrame(video, { type: "image/png" });
            return { confirmed: shot.confirmed, playing: !video.paused, bytes: shot.bytes };
        });

        expect(result.confirmed).toBe(true);
        expect(result.playing, "capturing the current frame does not pause it").toBe(true);
        expect(result.bytes).toBeGreaterThan(0);
    });

    test("refuses a live stream, which has no instant but now", async ({ page }) => {
        const failure = await page.evaluate(async () => {
            const { captureFrame } = await import("/imaging-dist/frame.js");
            const canvas = document.createElement("canvas");
            canvas.width = 32;
            canvas.height = 32;
            canvas.getContext("2d").fillRect(0, 0, 32, 32);
            const video = document.createElement("video");
            video.muted = true;
            video.srcObject = canvas.captureStream(30);
            await video.play();

            try {
                await captureFrame(video, { atMs: 500 });
                return { name: "none", message: "" };
            } catch (error) {
                return { name: (error as Error).name, message: (error as Error).message };
            }
        });

        expect(failure.name).toBe("FrameSeekError");
        expect(failure.message).toContain("MediaStream");
    });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { cachedResponseBytes } from "./cache-size";
import { readDeviceProfile } from "./device";
import { formatDurationMs } from "./format";
import { createInferenceProfiler } from "./profiler";

/** Drive `performance.now()` from a script so durations are exact. */
function stubClock(sequence: number[]): void {
    let index = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
        const value = sequence[Math.min(index, sequence.length - 1)] as number;
        index += 1;
        return value;
    });
}

/** Minimal Cache Storage stand-in backed by a map. */
function stubCaches(entries: Record<string, Response>): void {
    vi.stubGlobal("caches", {
        open: async () => ({
            match: async (url: string) => entries[url],
        }),
    });
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("createInferenceProfiler", () => {
    it("records the duration of each async stage", async () => {
        stubClock([0, 10, 35, 40, 65, 100]);

        const profiler = createInferenceProfiler();
        await profiler.stage("decode", async () => "image");
        await profiler.stage("infer", async () => "boxes");
        const report = await profiler.report();

        expect(report.timings).toEqual({ decode: 25, infer: 25 });
        expect(report.totalMs).toBe(100);
    });

    it("passes the stage value through", async () => {
        const profiler = createInferenceProfiler();

        await expect(profiler.stage("decode", async () => 42)).resolves.toBe(42);
        expect(profiler.stageSync("crop", () => "cropped")).toBe("cropped");
    });

    it("records a stage that threw, and rethrows", async () => {
        const profiler = createInferenceProfiler();

        await expect(
            profiler.stage("infer", () => Promise.reject(new Error("boom"))),
        ).rejects.toThrow("boom");

        const report = await profiler.report();
        expect(Object.keys(report.timings)).toEqual(["infer"]);
    });

    it("accumulates repeated stage names", async () => {
        const profiler = createInferenceProfiler();
        profiler.mark("forward-pass", 40);
        profiler.mark("forward-pass", 25);

        const report = await profiler.report();
        expect(report.timings["forward-pass"]).toBe(65);
    });

    it("charges concurrent stages their full span each", async () => {
        stubClock([0, 0, 0, 100, 100, 100]);

        const profiler = createInferenceProfiler();
        await Promise.all([
            profiler.stage("models", async () => null),
            profiler.stage("decode", async () => null),
        ]);
        const report = await profiler.report();

        expect(report.timings["models"]).toBe(100);
        expect(report.timings["decode"]).toBe(100);
        expect(report.totalMs).toBe(100);
    });

    it("keys models by name and reports their cached size", async () => {
        stubCaches({
            "/models/detect.onnx": new Response(null, {
                headers: { "Content-Length": "2048" },
            }),
        });

        const report = await createInferenceProfiler().report({
            models: [
                { name: "detector", cacheName: "app", url: "/models/detect.onnx" },
                { name: "classifier", cacheName: "app", url: "/models/classify.onnx" },
            ],
        });

        expect(report.models).toEqual([
            { name: "detector", bytes: 2048 },
            { name: "classifier", bytes: null },
        ]);
    });

    it("reports no models when none were asked for", async () => {
        const report = await createInferenceProfiler().report();
        expect(report.models).toEqual([]);
        expect(report.measuredAt).toBeGreaterThan(0);
    });
});

describe("cachedResponseBytes", () => {
    it("returns null when Cache Storage is unavailable", async () => {
        vi.stubGlobal("caches", undefined);
        expect(await cachedResponseBytes("app", "/m.onnx")).toBeNull();
    });

    it("returns null when the entry has neither header nor body", async () => {
        stubCaches({ "/m.onnx": new Response(null) });
        expect(await cachedResponseBytes("app", "/m.onnx")).toBeNull();
    });

    it("counts the body when Content-Length is missing", async () => {
        stubCaches({ "/m.onnx": new Response(new Uint8Array(4096)) });
        expect(await cachedResponseBytes("app", "/m.onnx")).toBe(4096);
    });

    it("counts a chunked body across reads", async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(1000));
                controller.enqueue(new Uint8Array(24));
                controller.close();
            },
        });
        stubCaches({ "/m.onnx": new Response(stream) });
        expect(await cachedResponseBytes("app", "/m.onnx")).toBe(1024);
    });

    it("prefers the header over the body it could have counted", async () => {
        stubCaches({
            "/m.onnx": new Response(new Uint8Array(9), {
                headers: { "Content-Length": "4096" },
            }),
        });
        expect(await cachedResponseBytes("app", "/m.onnx")).toBe(4096);
    });

    it("returns null when the entry is absent", async () => {
        stubCaches({});
        expect(await cachedResponseBytes("app", "/missing.onnx")).toBeNull();
    });

    it("returns null when the cache lookup throws", async () => {
        vi.stubGlobal("caches", {
            open: async () => {
                throw new Error("denied");
            },
        });
        expect(await cachedResponseBytes("app", "/m.onnx")).toBeNull();
    });

    it("parses the Content-Length header", async () => {
        stubCaches({
            "/m.onnx": new Response(null, { headers: { "Content-Length": "4096" } }),
        });
        expect(await cachedResponseBytes("app", "/m.onnx")).toBe(4096);
    });
});

describe("readDeviceProfile", () => {
    it("reports what the browser exposes", () => {
        const profile = readDeviceProfile();
        expect(profile).toHaveProperty("hardwareConcurrency");
        expect(profile).toHaveProperty("deviceMemoryGb");
        expect(profile).toHaveProperty("jsHeapUsedMb");
    });

    it("nulls out fields the platform withholds", () => {
        vi.stubGlobal("navigator", {});
        const profile = readDeviceProfile();

        expect(profile.hardwareConcurrency).toBeNull();
        expect(profile.deviceMemoryGb).toBeNull();
    });
});

describe("formatDurationMs", () => {
    it("keeps millisecond resolution below one second", () => {
        expect(formatDurationMs(142.6)).toBe("143 ms");
    });

    it("collapses sub-millisecond spans instead of rendering 0 ms", () => {
        expect(formatDurationMs(0.04)).toBe("<1 ms");
    });

    it("switches to seconds for cold starts", () => {
        expect(formatDurationMs(4321)).toBe("4.32 s");
    });

    it("renders an em dash for non-finite or negative input", () => {
        expect(formatDurationMs(Number.NaN)).toBe("—");
        expect(formatDurationMs(-1)).toBe("—");
    });
});

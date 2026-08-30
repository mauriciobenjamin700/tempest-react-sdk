import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    FakeAudioContext,
    fakeStream,
    installAudioContext,
    removeAudioContext,
} from "../../test/audio-mocks";
import { measureNoiseFloor, suggestGateThreshold } from "./noise-floor";

describe("suggestGateThreshold", () => {
    it("sits above the measured floor rather than on it", () => {
        expect(suggestGateThreshold(0.02)).toBeCloseTo(0.048, 5);
    });

    it("floors a silent measurement, because a threshold of zero never closes", () => {
        expect(suggestGateThreshold(0)).toBe(0.004);
        expect(suggestGateThreshold(Number.NaN)).toBe(0.004);
    });

    it("caps a loud one, because a threshold nothing clears never opens", () => {
        expect(suggestGateThreshold(0.9)).toBe(0.12);
    });
});

describe("measureNoiseFloor", () => {
    let restore: () => void;
    beforeEach(() => {
        vi.useFakeTimers();
        restore = installAudioContext();
    });
    afterEach(() => {
        restore();
        vi.useRealTimers();
    });

    /** Run the measurement while driving the room's level and the clock together. */
    async function measure(
        levels: number[],
        options: { durationMs?: number; onProgress?: (fraction: number) => void } = {},
    ): Promise<number> {
        const durationMs = options.durationMs ?? 200;
        const pending = measureNoiseFloor(fakeStream(), { ...options, durationMs });
        const analyser = FakeAudioContext.instances[0].analyser;

        for (const level of levels) {
            analyser.sample = level;
            vi.advanceTimersByTime(50);
            await Promise.resolve();
        }
        vi.advanceTimersByTime(durationMs);
        return pending;
    }

    it("reports the loudest window, not the average", async () => {
        const peak = await measure([0.01, 0.05, 0.01, 0.01]);
        expect(peak).toBeCloseTo(0.05, 5);
    });

    it("reports progress so a dialog can show the wait", async () => {
        const onProgress = vi.fn();
        await measure([0.01, 0.01], { onProgress });

        expect(onProgress).toHaveBeenCalled();
        const fractions = onProgress.mock.calls.map(([fraction]) => fraction as number);
        expect(Math.min(...fractions)).toBeGreaterThan(0);
        expect(Math.max(...fractions)).toBeLessThanOrEqual(1);
    });

    it("releases the graph it opened", async () => {
        await measure([0.01]);
        const context = FakeAudioContext.instances[0];

        expect(context.sources[0].disconnected).toBe(1);
    });

    it("answers zero when the engine has no Web Audio", async () => {
        const restoreEngine = removeAudioContext();
        await expect(measureNoiseFloor(fakeStream())).resolves.toBe(0);
        restoreEngine();
    });

    it("answers zero when the stream carries no audio track", async () => {
        const silent = { getAudioTracks: () => [] } as unknown as MediaStream;
        await expect(measureNoiseFloor(silent)).resolves.toBe(0);
    });

    it("reuses an injected context instead of opening a second one", async () => {
        const shared = new FakeAudioContext() as unknown as AudioContext;
        const pending = measureNoiseFloor(fakeStream(), { durationMs: 100, context: shared });
        vi.advanceTimersByTime(150);
        await pending;

        expect(FakeAudioContext.instances).toHaveLength(1);
    });
});

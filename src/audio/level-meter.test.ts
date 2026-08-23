import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    FakeAudioContext,
    fakeStream,
    installAudioContext,
    removeAudioContext,
} from "../../test/audio-mocks";
import { createLevelMeter } from "./level-meter";

describe("createLevelMeter", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installAudioContext();
    });
    afterEach(() => restore());

    it("reports RMS of the window", () => {
        const meter = createLevelMeter(fakeStream());
        const context = FakeAudioContext.instances[0];

        // Every sample at 0.5 → RMS is exactly 0.5.
        context.analyser.sample = 0.5;
        expect(meter.level()).toBeCloseTo(0.5, 5);
    });

    it("attacks instantly and releases slowly", () => {
        const meter = createLevelMeter(fakeStream(), { decay: 0.5 });
        const context = FakeAudioContext.instances[0];

        context.analyser.sample = 1;
        expect(meter.level()).toBeCloseTo(1, 5);

        // A meter that lagged on the way up would read as "not recording"; on the way
        // down, easing is what stops it looking broken.
        context.analyser.sample = 0;
        expect(meter.level()).toBeCloseTo(0.5, 5);
        expect(meter.level()).toBeCloseTo(0.25, 5);
    });

    it("clamps above 1", () => {
        const meter = createLevelMeter(fakeStream());
        FakeAudioContext.instances[0].analyser.sample = 4;
        expect(meter.level()).toBe(1);
    });

    it("honours a custom fftSize", () => {
        createLevelMeter(fakeStream(), { fftSize: 256 });
        expect(FakeAudioContext.instances[0].analyser.fftSize).toBe(256);
    });

    it("closes the context on stop, and reads 0 afterwards", () => {
        const meter = createLevelMeter(fakeStream());
        const context = FakeAudioContext.instances[0];
        context.analyser.sample = 0.9;

        meter.stop();

        expect(context.closed).toBe(true);
        expect(meter.level()).toBe(0);
    });

    it("is safe to stop twice", () => {
        const meter = createLevelMeter(fakeStream());
        meter.stop();
        expect(() => meter.stop()).not.toThrow();
    });

    it("degrades to a silent meter with no Web Audio", () => {
        const undo = removeAudioContext();
        try {
            const meter = createLevelMeter(fakeStream());
            expect(meter.level()).toBe(0);
            expect(() => meter.stop()).not.toThrow();
        } finally {
            undo();
        }
    });

    it("swallows a context that refuses to close", () => {
        const meter = createLevelMeter(fakeStream());
        const context = FakeAudioContext.instances[0];
        context.close = () => Promise.reject(new Error("audio device gone"));

        expect(() => meter.stop()).not.toThrow();
        expect(meter.level()).toBe(0);
    });
});

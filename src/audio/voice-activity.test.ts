import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    FakeAudioContext,
    fakeStream,
    installAudioContext,
    removeAudioContext,
} from "../../test/audio-mocks";
import { monitorVoiceActivity } from "./voice-activity";

/** The analyser the monitor's meter reads, so a test can drive the level. */
function detector() {
    return FakeAudioContext.instances[0].analyser;
}

describe("monitorVoiceActivity", () => {
    let restore: () => void;
    beforeEach(() => {
        vi.useFakeTimers();
        restore = installAudioContext();
    });
    afterEach(() => {
        restore();
        vi.useRealTimers();
    });

    it("says nothing while the state does not flip", () => {
        const onChange = vi.fn();
        monitorVoiceActivity(fakeStream(), onChange);

        detector().sample = 0;
        vi.advanceTimersByTime(1000);

        expect(onChange).not.toHaveBeenCalled();
    });

    it("reports the flip once, not once per sample", () => {
        const onChange = vi.fn();
        const vad = monitorVoiceActivity(fakeStream(), onChange);

        detector().sample = 0.2;
        vi.advanceTimersByTime(500);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(true);
        expect(vad.speaking).toBe(true);
    });

    it("holds through the gap between words", () => {
        const onChange = vi.fn();
        monitorVoiceActivity(fakeStream(), onChange);

        detector().sample = 0.2;
        vi.advanceTimersByTime(100);
        detector().sample = 0;
        vi.advanceTimersByTime(300);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenLastCalledWith(true);
    });

    it("falls once the quiet outlasts the release", () => {
        const onChange = vi.fn();
        const vad = monitorVoiceActivity(fakeStream(), onChange);

        detector().sample = 0.2;
        vi.advanceTimersByTime(100);
        detector().sample = 0;
        vi.advanceTimersByTime(500);

        expect(onChange).toHaveBeenLastCalledWith(false);
        expect(vad.speaking).toBe(false);
    });

    it("takes the threshold, the release and the poll from the caller", () => {
        const onChange = vi.fn();
        monitorVoiceActivity(fakeStream(), onChange, {
            threshold: 0.5,
            releaseMs: 50,
            pollMs: 10,
        });

        detector().sample = 0.2;
        vi.advanceTimersByTime(100);
        expect(onChange).not.toHaveBeenCalled();

        detector().sample = 0.6;
        vi.advanceTimersByTime(10);
        expect(onChange).toHaveBeenLastCalledWith(true);

        detector().sample = 0;
        vi.advanceTimersByTime(80);
        expect(onChange).toHaveBeenLastCalledWith(false);
    });

    it("measures the window as it is, so its release is the only one", () => {
        monitorVoiceActivity(fakeStream(), vi.fn());
        const meterSource = FakeAudioContext.instances[0].sources[0];

        detector().sample = 0.4;
        vi.advanceTimersByTime(100);
        detector().sample = 0;
        vi.advanceTimersByTime(100);

        expect(meterSource).toBeDefined();
        expect(FakeAudioContext.instances).toHaveLength(1);
    });

    it("stops sampling and releases the graph", () => {
        const onChange = vi.fn();
        const vad = monitorVoiceActivity(fakeStream(), onChange);
        vad.stop();

        detector().sample = 0.9;
        vi.advanceTimersByTime(1000);

        expect(onChange).not.toHaveBeenCalled();
        expect(FakeAudioContext.instances[0].closed).toBe(true);
    });

    it("shares an injected context and leaves it open on stop", () => {
        const shared = new FakeAudioContext() as unknown as AudioContext;
        const first = monitorVoiceActivity(fakeStream(), vi.fn(), { context: shared });
        const second = monitorVoiceActivity(fakeStream(), vi.fn(), { context: shared });

        first.stop();
        second.stop();

        expect(FakeAudioContext.instances).toHaveLength(1);
        expect((shared as unknown as FakeAudioContext).closed).toBe(false);
    });

    it("is inert, and never speaking, on an engine with no Web Audio", () => {
        const restoreEngine = removeAudioContext();
        const onChange = vi.fn();

        const vad = monitorVoiceActivity(fakeStream(), onChange);
        vi.advanceTimersByTime(1000);

        expect(vad.speaking).toBe(false);
        expect(onChange).not.toHaveBeenCalled();
        vad.stop();
        restoreEngine();
    });
});

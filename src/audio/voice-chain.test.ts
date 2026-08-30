import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    FakeAudioContext,
    fakeStream,
    installAudioContext,
    removeAudioContext,
} from "../../test/audio-mocks";
import {
    createVoiceChain,
    DEFAULT_VOICE_CHAIN,
    isVoiceChainIdle,
    monitorVoiceChain,
    type VoiceChainSettings,
} from "./voice-chain";

/** The context the chain just built. */
function context(): FakeAudioContext {
    return FakeAudioContext.instances[0];
}

/** A track to feed the chain, with `stop()` observable. */
function fakeTrack(): MediaStreamTrack {
    return fakeStream().getAudioTracks()[0];
}

/** Every stage off and unity gain — the shape that should build nothing. */
const ALL_OFF: VoiceChainSettings = {
    highPass: false,
    gate: false,
    gateThreshold: 0.02,
    compressor: false,
    presence: false,
    hissCut: false,
    deEsser: false,
    limiter: false,
};

describe("isVoiceChainIdle", () => {
    it("is true only when nothing would touch the signal", () => {
        expect(isVoiceChainIdle(ALL_OFF)).toBe(true);
        expect(isVoiceChainIdle(ALL_OFF, 1)).toBe(true);
        expect(isVoiceChainIdle(ALL_OFF, 1.4)).toBe(false);
        expect(isVoiceChainIdle({ ...ALL_OFF, highPass: true })).toBe(false);
        expect(isVoiceChainIdle(DEFAULT_VOICE_CHAIN)).toBe(false);
    });

    it("ignores the gate threshold, which changes nothing while the gate is off", () => {
        expect(isVoiceChainIdle({ ...ALL_OFF, gateThreshold: 0.09 })).toBe(true);
    });
});

describe("createVoiceChain — the graph", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installAudioContext();
    });
    afterEach(() => restore());

    it("builds no nodes at all for an idle chain, and hands the source straight back", () => {
        const source = fakeTrack();
        const chain = createVoiceChain(source, ALL_OFF);

        expect(chain.track).toBe(source);
        expect(chain.supported).toBe(false);
        expect(FakeAudioContext.instances).toHaveLength(0);
    });

    it("orders the stages the way a console does", () => {
        createVoiceChain(fakeTrack(), {
            ...DEFAULT_VOICE_CHAIN,
            gate: true,
            presence: true,
            hissCut: true,
        });

        const [highPass, presence, hissCut] = context().filters;
        expect(highPass.type).toBe("highpass");
        expect(highPass.frequency.value).toBe(85);
        expect(presence.type).toBe("peaking");
        expect(hissCut.type).toBe("lowpass");

        const [input] = context().sources;
        const [gate] = context().gains;
        expect(input.connectedTo).toContain(highPass);
        expect(highPass.connectedTo).toContain(gate);
        expect(gate.connectedTo).toContain(context().compressors[0]);
    });

    it("puts the limiter after the output gain, not before it", () => {
        createVoiceChain(fakeTrack(), DEFAULT_VOICE_CHAIN, { gain: 2 });

        const output = context().gains.find((gain) => gain.gain.value === 2);
        const limiter = context().compressors[1];
        expect(output?.connectedTo).toContain(limiter);
        expect(limiter.connectedTo).toEqual(context().destinations);
        expect(limiter.threshold.value).toBe(-1);
        expect(limiter.ratio.value).toBe(20);
    });

    it("levels with a compressor and limits with a limiter — different shapes", () => {
        createVoiceChain(fakeTrack(), DEFAULT_VOICE_CHAIN);

        const [leveller, limiter] = context().compressors;
        expect(leveller.ratio.value).toBe(3);
        expect(leveller.knee.value).toBe(30);
        expect(limiter.ratio.value).toBe(20);
        expect(limiter.knee.value).toBe(0);
    });

    it("reuses an injected context instead of opening a second one", () => {
        const shared = new FakeAudioContext() as unknown as AudioContext;
        createVoiceChain(fakeTrack(), DEFAULT_VOICE_CHAIN, { context: shared });

        expect(FakeAudioContext.instances).toHaveLength(1);
    });

    it("stops the source on release, unless the source belongs to somebody else", () => {
        const owned = fakeTrack();
        createVoiceChain(owned, DEFAULT_VOICE_CHAIN).release();
        expect(owned.stop).toBeDefined();
        expect((owned as unknown as { stopped: boolean }).stopped).toBe(true);

        const borrowed = fakeTrack();
        createVoiceChain(borrowed, DEFAULT_VOICE_CHAIN, { ownsSource: false }).release();
        expect((borrowed as unknown as { stopped: boolean }).stopped).toBe(false);
    });

    it("hands the source back untouched when this engine has no Web Audio", () => {
        const restoreEngine = removeAudioContext();
        const source = fakeTrack();

        const chain = createVoiceChain(source, DEFAULT_VOICE_CHAIN);
        expect(chain.track).toBe(source);
        expect(chain.supported).toBe(false);

        restoreEngine();
    });
});

describe("createVoiceChain — the gate", () => {
    let restore: () => void;
    beforeEach(() => {
        vi.useFakeTimers();
        restore = installAudioContext();
    });
    afterEach(() => {
        restore();
        vi.useRealTimers();
    });

    /** Build a gated chain and hand back the detector and the gain it drives. */
    function gatedChain(threshold = 0.05) {
        const chain = createVoiceChain(fakeTrack(), {
            ...ALL_OFF,
            gate: true,
            gateThreshold: threshold,
        });
        return { chain, detector: context().analysers[0], gain: context().gains[0] };
    }

    it("starts closed, so a chain built in a quiet room leaks nothing", () => {
        const { gain } = gatedChain();
        expect(gain.gain.value).toBe(0);
    });

    it("opens on speech and stays open across the silence between syllables", () => {
        const { detector, gain } = gatedChain(0.05);

        detector.sample = 0.2;
        vi.advanceTimersByTime(20);
        expect(gain.gain.targets.at(-1)?.value).toBe(1);

        detector.sample = 0;
        vi.advanceTimersByTime(200);
        expect(gain.gain.targets.at(-1)?.value).toBe(1);
    });

    it("closes once the silence outlasts the hold", () => {
        const { detector, gain } = gatedChain(0.05);

        detector.sample = 0.2;
        vi.advanceTimersByTime(20);
        detector.sample = 0;
        vi.advanceTimersByTime(240);

        expect(gain.gain.targets.at(-1)?.value).toBe(0);
    });

    it("opens fast and closes slow, so a first syllable survives and a word does not clip", () => {
        const { detector, gain } = gatedChain(0.05);

        detector.sample = 0.2;
        vi.advanceTimersByTime(20);
        const opening = gain.gain.targets.at(-1);

        detector.sample = 0;
        vi.advanceTimersByTime(240);
        const closing = gain.gain.targets.at(-1);

        expect(opening?.timeConstant).toBeLessThan(closing?.timeConstant ?? 0);
    });

    it("reads the threshold on every tick, so a slider moves a live chain", () => {
        const settings: VoiceChainSettings = { ...ALL_OFF, gate: true, gateThreshold: 0.5 };
        createVoiceChain(fakeTrack(), settings);
        const detector = context().analysers[0];
        const gain = context().gains[0];

        detector.sample = 0.2;
        vi.advanceTimersByTime(20);
        expect(gain.gain.targets.at(-1)?.value).toBe(0);

        settings.gateThreshold = 0.05;
        vi.advanceTimersByTime(20);
        expect(gain.gain.targets.at(-1)?.value).toBe(1);
    });

    it("stops polling on release", () => {
        const { chain, detector, gain } = gatedChain();
        detector.sample = 0.2;
        vi.advanceTimersByTime(20);
        const before = gain.gain.targets.length;

        chain.release();
        vi.advanceTimersByTime(200);

        expect(gain.gain.targets).toHaveLength(before);
    });
});

describe("createVoiceChain — the de-esser", () => {
    let restore: () => void;
    beforeEach(() => {
        vi.useFakeTimers();
        restore = installAudioContext();
    });
    afterEach(() => {
        restore();
        vi.useRealTimers();
    });

    /** Build a de-essed chain, with the band detector and the shaper it drives. */
    function deEssedChain() {
        const chain = createVoiceChain(fakeTrack(), { ...ALL_OFF, deEsser: true });
        const band = context().filters[0];
        const shaper = context().filters[1];
        return { chain, band, shaper, detector: context().analysers[0] };
    }

    it("listens through a band-pass on the sibilance band, not to the whole signal", () => {
        const { band, shaper, detector } = deEssedChain();

        expect(band.type).toBe("bandpass");
        expect(band.frequency.value).toBe(7000);
        expect(band.connectedTo).toContain(detector);
        expect(shaper.type).toBe("peaking");
        expect(shaper.frequency.value).toBe(7000);
    });

    it("cuts while the band is loud and lets go when it is not", () => {
        const { shaper, detector } = deEssedChain();

        detector.sample = 0.06;
        vi.advanceTimersByTime(20);
        const cutting = shaper.gain.targets.at(-1)?.value ?? 0;
        expect(cutting).toBeLessThan(0);

        detector.sample = 0;
        vi.advanceTimersByTime(20);
        expect(shaper.gain.targets.at(-1)?.value).toBeCloseTo(0, 10);
    });

    it("never cuts deeper than the stage's ceiling, however loud the band gets", () => {
        const { shaper, detector } = deEssedChain();

        detector.sample = 1;
        vi.advanceTimersByTime(20);

        expect(shaper.gain.targets.at(-1)?.value).toBe(-10);
    });

    it("ignores band energy below the threshold, so ordinary speech is untouched", () => {
        const { shaper, detector } = deEssedChain();

        detector.sample = 0.01;
        vi.advanceTimersByTime(20);

        expect(shaper.gain.targets.at(-1)?.value).toBeCloseTo(0, 10);
    });

    it("stops polling on release", () => {
        const { chain, shaper, detector } = deEssedChain();
        detector.sample = 0.06;
        vi.advanceTimersByTime(20);
        const before = shaper.gain.targets.length;

        chain.release();
        vi.advanceTimersByTime(100);

        expect(shaper.gain.targets).toHaveLength(before);
    });
});

describe("monitorVoiceChain", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installAudioContext();
    });
    afterEach(() => restore());

    it("routes the processed track to the speakers", () => {
        const source = fakeTrack();
        monitorVoiceChain(source, DEFAULT_VOICE_CHAIN);

        const playback = context().sources.at(-1);
        expect(playback?.connectedTo).toContain(context().destination);
    });

    it("never stops the track it was handed, which belongs to the preview", () => {
        const source = fakeTrack();
        const monitor = monitorVoiceChain(source, DEFAULT_VOICE_CHAIN);
        monitor.stop();

        expect((source as unknown as { stopped: boolean }).stopped).toBe(false);
    });

    it("is inert on an engine with no Web Audio", () => {
        const restoreEngine = removeAudioContext();
        expect(() => monitorVoiceChain(fakeTrack(), DEFAULT_VOICE_CHAIN).stop()).not.toThrow();
        restoreEngine();
    });
});

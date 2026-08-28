import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    FakeAudioContext,
    fakeStream,
    fakeVideoStream,
    installAudioContext,
    installVideoElement,
    removeAudioContext,
} from "../../test/audio-mocks";
import { createAudioBus, DEFAULT_MAX_GAIN } from "./audio-bus";

/** The context the bus just built. */
function context(): FakeAudioContext {
    return FakeAudioContext.instances[0];
}

/**
 * jsdom implements no media pipeline, so every `play()` and `pause()` the bus
 * makes reports "Not implemented" to the virtual console. The bus calls both on
 * two elements per source; without this the real assertions are buried.
 */
let restoreMedia: () => void;
beforeEach(() => {
    restoreMedia = installVideoElement();
});
afterEach(() => restoreMedia());

describe("createAudioBus — the graph", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installAudioContext();
    });
    afterEach(() => restore());

    it("puts the limiter after the mix, not on each source", () => {
        const bus = createAudioBus();
        bus.attach(fakeStream());
        bus.attach(fakeStream(1, "stream-2"));

        const [master, first, second] = context().gains;
        const limiter = context().compressors[0];

        expect(context().compressors).toHaveLength(1);
        expect(master.connectedTo).toEqual([limiter]);
        expect(limiter.connectedTo).toEqual(context().destinations);
        expect(first.connectedTo).toEqual([master]);
        expect(second.connectedTo).toEqual([master]);
    });

    it("uses limiting settings, not compression ones", () => {
        createAudioBus();
        const limiter = context().compressors[0];

        expect(limiter.threshold.value).toBe(-8);
        expect(limiter.knee.value).toBe(0);
        expect(limiter.ratio.value).toBe(20);
        expect(limiter.attack.value).toBe(0.003);
    });

    it("takes an override for a single limiter param", () => {
        createAudioBus({ limiter: { threshold: -3 } });
        const limiter = context().compressors[0];

        expect(limiter.threshold.value).toBe(-3);
        expect(limiter.ratio.value).toBe(20);
    });

    it("wires the master straight to the output when the limiter is off", () => {
        createAudioBus({ limiter: false });

        expect(context().compressors).toHaveLength(0);
        expect(context().gains[0].connectedTo).toEqual(context().destinations);
    });

    it("reuses an injected context instead of opening a second one", () => {
        const shared = new FakeAudioContext() as unknown as AudioContext;
        const before = FakeAudioContext.instances.length;

        const bus = createAudioBus({ context: shared });
        bus.close();

        expect(FakeAudioContext.instances).toHaveLength(before);
        expect((shared as unknown as FakeAudioContext).closed).toBe(false);
    });
});

describe("createAudioBus — gain", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installAudioContext();
    });
    afterEach(() => restore());

    it("goes above 1, which an <audio> element cannot", () => {
        const bus = createAudioBus();
        const handle = bus.attach(fakeStream());

        handle.setGain(2.4);

        expect(handle.gain).toBe(2.4);
        expect(context().gains[1].gain.value).toBe(2.4);
    });

    it("clamps to the ceiling, to the floor, and treats NaN as unity", () => {
        const bus = createAudioBus({ maxGain: 3 });
        const handle = bus.attach(fakeStream());

        handle.setGain(5);
        expect(handle.gain).toBe(3);

        handle.setGain(-1);
        expect(handle.gain).toBe(0);

        handle.setGain(Number.NaN);
        expect(handle.gain).toBe(1);
    });

    it("honours a custom ceiling on both the source and the master", () => {
        const bus = createAudioBus({ maxGain: 1.5 });
        const handle = bus.attach(fakeStream(), { gain: 9 });

        bus.setMasterGain(9);

        expect(handle.gain).toBe(1.5);
        expect(bus.masterGain).toBe(1.5);
    });

    it("defaults the ceiling to DEFAULT_MAX_GAIN", () => {
        const bus = createAudioBus();
        const handle = bus.attach(fakeStream(), { gain: 100 });

        expect(handle.gain).toBe(DEFAULT_MAX_GAIN);
    });

    it("scales the whole mix through the master node", () => {
        const bus = createAudioBus();
        bus.setMasterGain(1.2);

        expect(bus.masterGain).toBe(1.2);
        expect(context().gains[0].gain.value).toBe(1.2);
    });
});

describe("createAudioBus — attaching and detaching", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installAudioContext();
    });
    afterEach(() => restore());

    it("anchors the stream to a muted element, or Chrome pulls no samples", () => {
        const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
        const bus = createAudioBus();

        bus.attach(fakeStream());

        expect(playSpy).toHaveBeenCalledTimes(2);
        playSpy.mockRestore();
    });

    it("survives an engine whose play() throws instead of rejecting", () => {
        const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => {
            throw new Error("Not implemented");
        });
        const bus = createAudioBus();

        expect(() => bus.attach(fakeStream())).not.toThrow();
        playSpy.mockRestore();
    });

    it("is inert for a stream with no audio track", () => {
        const bus = createAudioBus();
        const { stream } = fakeVideoStream();

        const handle = bus.attach(stream);
        handle.setGain(2);
        handle.stop();

        expect(handle.gain).toBe(1);
        expect(context().sources).toHaveLength(0);
    });

    it("feeds the graph the audio track alone, so video never rides along", () => {
        class FakeMediaStream {
            constructor(public tracks: MediaStreamTrack[]) {}
        }
        vi.stubGlobal("MediaStream", FakeMediaStream);
        const bus = createAudioBus();
        const { stream } = fakeVideoStream({ audio: true });

        bus.attach(stream);

        const fed = context().sources[0].stream as FakeMediaStream;
        expect(fed).toBeInstanceOf(FakeMediaStream);
        expect(fed.tracks).toHaveLength(1);
        vi.unstubAllGlobals();
    });

    it("swallows a play() the browser rejects, such as a blocked autoplay", async () => {
        const playSpy = vi
            .spyOn(HTMLMediaElement.prototype, "play")
            .mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
        const bus = createAudioBus();

        expect(() => bus.attach(fakeStream())).not.toThrow();
        await Promise.resolve();
        playSpy.mockRestore();
    });

    it("releases only its own nodes on stop", () => {
        const bus = createAudioBus();
        const first = bus.attach(fakeStream());
        bus.attach(fakeStream(1, "stream-2"));

        first.stop();

        expect(context().sources[0].disconnected).toBe(1);
        expect(context().sources[1].disconnected).toBe(0);
    });

    it("ignores a second stop", () => {
        const bus = createAudioBus();
        const handle = bus.attach(fakeStream());

        handle.stop();
        handle.stop();

        expect(context().sources[0].disconnected).toBe(1);
    });

    it("detaches everything and closes the context it created", () => {
        const bus = createAudioBus();
        bus.attach(fakeStream());

        bus.close();

        expect(context().sources[0].disconnected).toBe(1);
        expect(context().closed).toBe(true);
    });

    it("hands back an inert handle after close, since a late stream is normal", () => {
        const bus = createAudioBus();
        bus.close();

        const handle = bus.attach(fakeStream());
        handle.setGain(2);

        expect(handle.gain).toBe(1);
        expect(context().sources).toHaveLength(0);
        expect(() => handle.stop()).not.toThrow();
    });

    it("ignores a master gain set after close", () => {
        const bus = createAudioBus();
        bus.setMasterGain(2);
        bus.close();

        bus.setMasterGain(0.5);

        expect(bus.masterGain).toBe(2);
    });

    it("closes once, however many times it is asked", () => {
        const bus = createAudioBus();

        bus.close();
        bus.close();

        expect(context().gains[0].disconnected).toBe(1);
    });

    it("releases the limiter too, which outlives an injected context", () => {
        const shared = new FakeAudioContext() as unknown as AudioContext;
        const bus = createAudioBus({ context: shared });

        bus.close();

        const limiter = (shared as unknown as FakeAudioContext).compressors[0];
        expect(limiter.disconnected).toBe(1);
    });

    it("survives a context that refuses to close", async () => {
        FakeAudioContext.closeShouldReject = true;
        const bus = createAudioBus();

        expect(() => bus.close()).not.toThrow();
        await Promise.resolve();
    });

    it("resumes a context the autoplay policy suspended", async () => {
        const bus = createAudioBus();

        await bus.resume();

        expect(context().resumed).toBe(1);
    });

    it("survives a resume the browser refuses", async () => {
        const bus = createAudioBus();
        vi.spyOn(context(), "resume").mockRejectedValue(new Error("no gesture"));

        await expect(bus.resume()).resolves.toBeUndefined();
    });
});

describe("createAudioBus — output device", () => {
    let restore: () => void;
    beforeEach(() => {
        restore = installAudioContext();
    });
    afterEach(() => {
        restore();
        delete (HTMLMediaElement.prototype as { setSinkId?: unknown }).setSinkId;
    });

    it("reports whether the engine can route audio at all", () => {
        expect(createAudioBus().canSelectOutput).toBe(false);

        (HTMLMediaElement.prototype as { setSinkId?: unknown }).setSinkId = vi.fn();
        expect(createAudioBus().canSelectOutput).toBe(true);
    });

    it("routes the mix and remembers the device", async () => {
        const setSinkId = vi.fn().mockResolvedValue(undefined);
        (HTMLMediaElement.prototype as { setSinkId?: unknown }).setSinkId = setSinkId;
        const bus = createAudioBus();

        await expect(bus.setOutputDevice("headset-1")).resolves.toBe(true);

        expect(setSinkId).toHaveBeenCalledWith("headset-1");
        expect(bus.outputDevice).toBe("headset-1");
    });

    it("keeps the previous route when the device vanished", async () => {
        const setSinkId = vi
            .fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("gone"));
        (HTMLMediaElement.prototype as { setSinkId?: unknown }).setSinkId = setSinkId;
        const bus = createAudioBus();

        await bus.setOutputDevice("headset-1");
        await expect(bus.setOutputDevice("unplugged")).resolves.toBe(false);

        expect(bus.outputDevice).toBe("headset-1");
    });

    it("answers false on an engine with no setSinkId, instead of throwing", async () => {
        const bus = createAudioBus();

        await expect(bus.setOutputDevice("headset-1")).resolves.toBe(false);
        expect(bus.outputDevice).toBe("");
    });
});

describe("createAudioBus — no Web Audio", () => {
    it("stays callable and says so, instead of throwing", async () => {
        const restore = removeAudioContext();
        const bus = createAudioBus();
        const handle = bus.attach(fakeStream());

        handle.setGain(2);
        bus.setMasterGain(2);
        bus.close();

        expect(bus.supported).toBe(false);
        expect(bus.canSelectOutput).toBe(false);
        expect(handle.gain).toBe(1);
        expect(bus.masterGain).toBe(1);
        expect(bus.outputDevice).toBe("");
        await expect(bus.setOutputDevice("x")).resolves.toBe(false);
        await expect(bus.resume()).resolves.toBeUndefined();
        expect(() => handle.stop()).not.toThrow();
        restore();
    });

    it("falls back to the prefixed constructor Safari exposes", () => {
        const restore = removeAudioContext();
        (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext = FakeAudioContext;
        FakeAudioContext.reset();

        expect(createAudioBus().supported).toBe(true);

        delete (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext;
        restore();
    });
});

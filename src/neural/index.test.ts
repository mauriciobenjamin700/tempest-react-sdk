import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeAudioContext, fakeStream, setSecureContext } from "../../test/audio-mocks";

/**
 * The peer module's two exports, both replaced with controllable doubles.
 *
 * `loadRnnoise` is the wasm fetch and compile, and `RnnoiseWorkletNode` the
 * graph's midpoint — a real class, because the code under test constructs it
 * with `new`. Instances are collected so the graph wiring can be asserted on
 * the actual node that was built.
 */
const suppressor = vi.hoisted(() => {
    type FakeWorkletNode = {
        context: unknown;
        options: { maxChannels: number; wasmBinary: ArrayBuffer };
        connectedTo: unknown[];
        disconnected: number;
        destroyed: number;
    };
    const nodes: FakeWorkletNode[] = [];
    let throwOnConstruct = false;
    return {
        loadRnnoise: vi.fn<() => Promise<ArrayBuffer>>(),
        nodes,
        graph: {
            set throwOnConstruct(value: boolean) {
                throwOnConstruct = value;
            },
        },
        FakeRnnoiseWorkletNode: class fake {
            options: { maxChannels: number; wasmBinary: ArrayBuffer };
            connectedTo: unknown[] = [];
            disconnected = 0;
            destroyed = 0;
            constructor(
                public context: unknown,
                options: { maxChannels: number; wasmBinary: ArrayBuffer },
            ) {
                if (throwOnConstruct) throw new Error("no worklet for this engine");
                this.options = options;
                nodes.push(this);
            }
            connect(target: unknown): void {
                this.connectedTo.push(target);
            }
            disconnect(): void {
                this.disconnected += 1;
            }
            destroy(): void {
                this.destroyed += 1;
            }
        },
    };
});

vi.mock("@sapphi-red/web-noise-suppressor", () => ({
    loadRnnoise: suppressor.loadRnnoise,
    RnnoiseWorkletNode: suppressor.FakeRnnoiseWorkletNode,
}));

import type { NeuralSuppressorAssets } from "./index";

const ASSETS: NeuralSuppressorAssets = {
    workletUrl: "/worklet.js",
    wasmUrl: "/rnnoise.wasm",
    simdWasmUrl: "/rnnoise_simd.wasm",
};

const BINARY = new ArrayBuffer(8);

/**
 * The module under test.
 *
 * Re-imported after every test through `vi.resetModules()`, because the module
 * caches the compiled wasm and the prepared contexts in its own scope and one
 * successful prepare would otherwise make every later test see "already
 * loaded". The peer mock is untouched by a reset — it belongs to `vi.hoisted`.
 */
function importModule() {
    vi.resetModules();
    return import("./index");
}

/**
 * A context augmented with the two members this module reads that the fake does
 * not carry: the sample rate and the worklet registrar.
 *
 * Intersected with `AudioContext` so the call sites accept it, and with
 * `FakeAudioContext` so the graph the fake records stays readable.
 */
type PreparedContext = AudioContext &
    FakeAudioContext & {
        sampleRate: number;
        audioWorklet: { addModule: ReturnType<typeof vi.fn> };
    };

/** Build a context at a given sample rate, with the worklet registrar. */
function context(sampleRate = 48_000): PreparedContext {
    const fake = new FakeAudioContext() as unknown as PreparedContext;
    return Object.assign(fake, {
        sampleRate,
        audioWorklet: { addModule: vi.fn(async () => undefined) },
    });
}

/** The single worklet node the last `createNeuralSuppressor` built. */
function builtNode(): (typeof suppressor.nodes)[number] {
    return suppressor.nodes[0] as (typeof suppressor.nodes)[number];
}

beforeEach(() => {
    suppressor.nodes.length = 0;
    suppressor.loadRnnoise.mockReset();
    suppressor.loadRnnoise.mockResolvedValue(BINARY);
    suppressor.graph.throwOnConstruct = false;
});

describe("isNeuralSuppressionSupported", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("is true when a worklet and a secure context are both there", async () => {
        vi.stubGlobal("AudioWorkletNode", class {});
        setSecureContext(true);

        expect((await importModule()).isNeuralSuppressionSupported()).toBe(true);
    });

    it("is false when the engine has no AudioWorklet", async () => {
        vi.stubGlobal("AudioWorkletNode", undefined);
        setSecureContext(true);

        expect((await importModule()).isNeuralSuppressionSupported()).toBe(false);
    });

    it("is false on an insecure page, where the browser refuses the microphone graph", async () => {
        vi.stubGlobal("AudioWorkletNode", class {});
        setSecureContext(false);

        expect((await importModule()).isNeuralSuppressionSupported()).toBe(false);
    });
});

describe("prepareNeuralSuppressor", () => {
    it("registers the worklet module from the asset URL", async () => {
        const mod = await importModule();
        const ctx = context();

        await mod.prepareNeuralSuppressor(ctx, ASSETS);

        expect(ctx.audioWorklet.addModule).toHaveBeenCalledWith(ASSETS.workletUrl);
        expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    });

    it("registers once per context, however often it is asked", async () => {
        const mod = await importModule();
        const ctx = context();
        const prepare = (): Promise<ArrayBuffer> => mod.prepareNeuralSuppressor(ctx, ASSETS);

        await Promise.all([prepare(), prepare()]);

        expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
        expect(suppressor.loadRnnoise).toHaveBeenCalledTimes(1);
    });

    it("registers on every distinct context that asks", async () => {
        const mod = await importModule();

        await Promise.all([
            mod.prepareNeuralSuppressor(context(), ASSETS),
            mod.prepareNeuralSuppressor(context(), ASSETS),
        ]);

        expect(suppressor.loadRnnoise).toHaveBeenCalledTimes(1);
        for (const ctx of FakeAudioContext.instances as unknown as PreparedContext[]) {
            expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
        }
    });

    it("shares one wasm fetch between every caller", async () => {
        const mod = await importModule();
        const ctx = context();
        const first = await mod.prepareNeuralSuppressor(ctx, ASSETS);
        const second = await mod.prepareNeuralSuppressor(ctx, ASSETS);

        expect(suppressor.loadRnnoise).toHaveBeenCalledTimes(1);
        expect(suppressor.loadRnnoise).toHaveBeenCalledWith({
            url: ASSETS.wasmUrl,
            simdUrl: ASSETS.simdWasmUrl,
        });
        expect(first).toBe(BINARY);
        expect(second).toBe(BINARY);
    });

    it("throws what the module registration threw", async () => {
        const mod = await importModule();
        const ctx = context();
        ctx.audioWorklet.addModule.mockRejectedValue(new Error("no module"));

        await expect(mod.prepareNeuralSuppressor(ctx, ASSETS)).rejects.toThrow("no module");
    });

    it("retries a registration and a fetch that failed, rather than replaying them", async () => {
        const mod = await importModule();
        const ctx = context();
        ctx.audioWorklet.addModule.mockRejectedValueOnce(new Error("offline"));
        suppressor.loadRnnoise
            .mockRejectedValueOnce(new Error("net down"))
            .mockResolvedValueOnce(BINARY);

        await expect(mod.prepareNeuralSuppressor(ctx, ASSETS)).rejects.toThrow("offline");
        await expect(mod.prepareNeuralSuppressor(ctx, ASSETS)).rejects.toThrow("net down");
        await expect(mod.prepareNeuralSuppressor(ctx, ASSETS)).resolves.toBe(BINARY);

        expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(2);
        expect(suppressor.loadRnnoise).toHaveBeenCalledTimes(2);
    });

    it("retries a fetch that failed after a good registration", async () => {
        const mod = await importModule();
        const ctx = context();
        suppressor.loadRnnoise
            .mockRejectedValueOnce(new Error("net down"))
            .mockResolvedValueOnce(BINARY);

        await expect(mod.prepareNeuralSuppressor(ctx, ASSETS)).rejects.toThrow("net down");
        await expect(mod.prepareNeuralSuppressor(ctx, ASSETS)).resolves.toBe(BINARY);

        expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
        expect(suppressor.loadRnnoise).toHaveBeenCalledTimes(2);
    });
});

describe("createNeuralSuppressor — the graph", () => {
    afterEach(() => vi.unstubAllGlobals());

    function withStubMediaStream(): void {
        class StubMediaStream {
            constructor(public tracks: readonly MediaStreamTrack[] = []) {}
        }
        vi.stubGlobal("MediaStream", StubMediaStream);
    }

    it("answers null at any rate but 48 kHz, without loading a thing", async () => {
        const mod = await importModule();
        withStubMediaStream();
        const ctx = context(44_100);

        await expect(
            mod.createNeuralSuppressor(ctx, fakeStream().getAudioTracks()[0], ASSETS, {
                maxChannels: 1,
            }),
        ).resolves.toBeNull();
        expect(suppressor.loadRnnoise).not.toHaveBeenCalled();
    });

    it("routes the source through the worklet into a destination", async () => {
        const mod = await importModule();
        withStubMediaStream();
        const ctx = context();
        const source = fakeStream().getAudioTracks()[0];

        const built = await mod.createNeuralSuppressor(ctx, source, ASSETS, { maxChannels: 2 });

        expect(built).not.toBeNull();
        const node = builtNode();
        expect(node.options).toEqual({ maxChannels: 2, wasmBinary: BINARY });
        expect(ctx.sources[0]?.connectedTo).toContain(node);
        expect(node.connectedTo).toEqual(ctx.destinations);
        expect(built?.track).toBe(ctx.destinations[0].stream.getAudioTracks()[0]);
        expect(built?.track).not.toBe(source);
    });

    it("carries the source's content hint onto the track it publishes", async () => {
        const mod = await importModule();
        withStubMediaStream();
        const ctx = context();
        const source = fakeStream().getAudioTracks()[0] as unknown as {
            contentHint: string;
        };
        source.contentHint = "speech";

        const built = await mod.createNeuralSuppressor(
            ctx,
            source as unknown as MediaStreamTrack,
            ASSETS,
            { maxChannels: 1 },
        );

        expect(built?.track.contentHint).toBe("speech");
    });

    it("release disconnects the graph and stops the published track, not the capture", async () => {
        const mod = await importModule();
        withStubMediaStream();
        const ctx = context();
        const source = fakeStream().getAudioTracks()[0] as unknown as { stopped: boolean };

        const built = await mod.createNeuralSuppressor(
            ctx,
            source as unknown as MediaStreamTrack,
            ASSETS,
            { maxChannels: 1 },
        );
        built?.release();

        const node = builtNode();
        expect(node.disconnected).toBe(1);
        expect(node.destroyed).toBe(1);
        expect(ctx.sources[0]?.disconnected).toBe(1);
        expect((built?.track as unknown as { stopped: boolean }).stopped).toBe(true);
        expect(source.stopped).toBe(false);
    });

    it("answers null when the worklet cannot run on this engine", async () => {
        const mod = await importModule();
        withStubMediaStream();
        suppressor.graph.throwOnConstruct = true;
        const ctx = context();

        await expect(
            mod.createNeuralSuppressor(ctx, fakeStream().getAudioTracks()[0], ASSETS, {
                maxChannels: 1,
            }),
        ).resolves.toBeNull();
        expect(suppressor.nodes).toHaveLength(0);
    });

    it("answers null when nothing loads, leaving the graph unbuilt", async () => {
        const mod = await importModule();
        withStubMediaStream();
        suppressor.loadRnnoise.mockRejectedValue(new Error("offline"));
        const ctx = context();

        await expect(
            mod.createNeuralSuppressor(ctx, fakeStream().getAudioTracks()[0], ASSETS, {
                maxChannels: 1,
            }),
        ).resolves.toBeNull();
        expect(suppressor.nodes).toHaveLength(0);
    });

    it("tears the build down and answers null when the destination yields no track", async () => {
        const mod = await importModule();
        withStubMediaStream();
        const ctx = context();
        ctx.createMediaStreamDestination = (() => ({
            stream: fakeStream(0),
            disconnect: (): void => undefined,
        })) as unknown as PreparedContext["createMediaStreamDestination"];

        await expect(
            mod.createNeuralSuppressor(ctx, fakeStream().getAudioTracks()[0], ASSETS, {
                maxChannels: 1,
            }),
        ).resolves.toBeNull();

        const node = builtNode();
        expect(ctx.sources[0]?.disconnected).toBe(1);
        expect(node.destroyed).toBe(1);
    });

    it("shares the load with a caller that already prepared", async () => {
        const mod = await importModule();
        withStubMediaStream();
        const ctx = context();

        await mod.prepareNeuralSuppressor(ctx, ASSETS);
        await mod.createNeuralSuppressor(ctx, fakeStream().getAudioTracks()[0], ASSETS, {
            maxChannels: 1,
        });

        expect(suppressor.loadRnnoise).toHaveBeenCalledTimes(1);
    });
});

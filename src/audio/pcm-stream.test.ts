import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPcmStream, isPcmStreamSupported, pcmWorkletSource } from "./pcm-stream";

interface Processor {
    port: {
        onmessage: ((event: { data: unknown }) => void) | null;
        postMessage: (data: unknown) => void;
    };
    process(inputs: Float32Array[][]): boolean;
}

/**
 * Run the real worklet source with stand-ins for the worklet globals.
 *
 * @param rate The context rate the processor sees as `sampleRate`.
 * @param options processorOptions.
 * @returns The processor instance and the frames it posted.
 */
function bootWorklet(
    rate: number,
    options: { targetRate: number; frameSize: number; hopSize: number },
): { processor: Processor; posted: Float32Array[] } {
    const posted: Float32Array[] = [];
    let Registered: (new (opts: unknown) => Processor) | null = null;
    class AudioWorkletProcessor {
        port = {
            onmessage: null,
            postMessage: (data: unknown) => posted.push(data as Float32Array),
        };
    }
    const register = (_name: string, ctor: new (opts: unknown) => Processor): void => {
        Registered = ctor;
    };
    new Function("AudioWorkletProcessor", "registerProcessor", "sampleRate", pcmWorkletSource())(
        AudioWorkletProcessor,
        register,
        rate,
    );
    const Ctor = Registered as unknown as new (opts: unknown) => Processor;
    return { processor: new Ctor({ processorOptions: options }), posted };
}

describe("pcm worklet processor", () => {
    it("resamples 48 kHz input and posts 512-sample frames with no gap", () => {
        const { processor, posted } = bootWorklet(48_000, {
            targetRate: 16_000,
            frameSize: 512,
            hopSize: 512,
        });
        for (let block = 0; block < 375; block += 1) {
            processor.process([[new Float32Array(128).fill(0.25)]]);
        }
        const delivered = posted.length * 512;
        expect(Math.abs(delivered - 16_000)).toBeLessThanOrEqual(512 + 64);
        expect(posted.every((frame) => frame.length === 512)).toBe(true);
        const steady = posted[10] as Float32Array;
        expect(steady[100]).toBeCloseTo(0.25, 3);
    });

    it("averages channels before resampling", () => {
        const { processor, posted } = bootWorklet(16_000, {
            targetRate: 16_000,
            frameSize: 4,
            hopSize: 4,
        });
        for (let i = 0; i < 20; i += 1) {
            processor.process([[new Float32Array(128).fill(1), new Float32Array(128).fill(0)]]);
        }
        expect((posted[20] as Float32Array)[0]).toBeCloseTo(0.5, 3);
    });

    it("overlaps frames by hop", () => {
        const { processor, posted } = bootWorklet(16_000, {
            targetRate: 16_000,
            frameSize: 8,
            hopSize: 4,
        });
        for (let i = 0; i < 4; i += 1) processor.process([[new Float32Array(128).fill(0.1)]]);
        const produced = posted.length;
        expect(produced).toBeGreaterThan(0);
        processor.process([[new Float32Array(128).fill(0.1)]]);
        expect(posted.length - produced).toBe(32);
    });

    it("drops audio while paused and ends the processor on stop", () => {
        const { processor, posted } = bootWorklet(16_000, {
            targetRate: 16_000,
            frameSize: 64,
            hopSize: 64,
        });
        processor.port.onmessage?.({ data: "pause" });
        for (let i = 0; i < 10; i += 1) processor.process([[new Float32Array(128).fill(0.5)]]);
        expect(posted).toHaveLength(0);
        processor.port.onmessage?.({ data: "resume" });
        for (let i = 0; i < 10; i += 1) processor.process([[new Float32Array(128).fill(0.5)]]);
        expect(posted.length).toBeGreaterThan(0);
        processor.port.onmessage?.({ data: "stop" });
        expect(processor.process([[new Float32Array(128)]])).toBe(false);
    });

    it("keeps running on a block with no input connected", () => {
        const { processor } = bootWorklet(16_000, { targetRate: 16_000, frameSize: 4, hopSize: 4 });
        expect(processor.process([[]])).toBe(true);
        expect(processor.process([])).toBe(true);
    });
});

/** Fake Web Audio graph for the main-thread half. */
class FakeNode {
    connected: unknown[] = [];
    disconnected: unknown[] = [];
    constructor(readonly context: unknown) {}
    connect(target: unknown): void {
        this.connected.push(target);
    }
    disconnect(target?: unknown): void {
        this.disconnected.push(target ?? "all");
    }
}

class FakeWorkletNode extends FakeNode {
    static last: FakeWorkletNode | null = null;
    sent: unknown[] = [];
    port = {
        onmessage: null as ((event: { data: Float32Array }) => void) | null,
        postMessage: (data: unknown) => this.sent.push(data),
    };
    constructor(
        context: unknown,
        readonly name: string,
        readonly options: unknown,
    ) {
        super(context);
        FakeWorkletNode.last = this;
    }
}

class FakeContext {
    static created = 0;
    state = "suspended";
    closed = false;
    resumed = false;
    modules: string[] = [];
    audioWorklet = {
        addModule: vi.fn(async (url: string) => {
            if (FakeContext.failNext) {
                FakeContext.failNext = false;
                throw new Error("blocked by CSP");
            }
            this.modules.push(url);
        }),
    };
    static failNext = false;
    constructor() {
        FakeContext.created += 1;
    }
    createMediaStreamSource(): FakeNode {
        return new FakeNode(this);
    }
    async resume(): Promise<void> {
        this.resumed = true;
    }
    async close(): Promise<void> {
        this.closed = true;
    }
}

class FakeStream {
    constructor(private readonly tracks: unknown[]) {}
    getAudioTracks(): unknown[] {
        return this.tracks;
    }
}

beforeEach(() => {
    FakeContext.created = 0;
    FakeContext.failNext = false;
    vi.stubGlobal("AudioContext", FakeContext);
    vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
    vi.stubGlobal("AudioNode", FakeNode);
    vi.stubGlobal("MediaStream", FakeStream);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:pcm" }));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("createPcmStream", () => {
    it("delivers frames with their index and start time", async () => {
        const frames: [number, number, number][] = [];
        const stream = await createPcmStream(new FakeStream([{}]) as unknown as MediaStream, {
            onFrame: (frame, info) => frames.push([frame.length, info.index, info.startMs]),
        });
        const node = FakeWorkletNode.last as FakeWorkletNode;
        expect(node.options).toEqual({
            numberOfInputs: 1,
            numberOfOutputs: 0,
            processorOptions: { targetRate: 16_000, frameSize: 512, hopSize: 512 },
        });
        node.port.onmessage?.({ data: new Float32Array(512) });
        node.port.onmessage?.({ data: new Float32Array(512) });
        expect(frames).toEqual([
            [512, 0, 0],
            [512, 1, 32],
        ]);
        expect(stream.sampleRate).toBe(16_000);
    });

    it("creates its own context, resumes it, and closes it on release", async () => {
        const stream = await createPcmStream({} as MediaStreamTrack, { onFrame: () => undefined });
        const node = FakeWorkletNode.last as FakeWorkletNode;
        const context = node.context as FakeContext;
        expect(context.resumed).toBe(true);
        stream.pause();
        stream.resume();
        stream.release();
        stream.release();
        expect(node.sent).toEqual(["pause", "resume", "stop"]);
        expect(context.closed).toBe(true);
    });

    it("leaves a context it was given open", async () => {
        const context = new FakeContext();
        const stream = await createPcmStream({} as MediaStreamTrack, {
            onFrame: () => undefined,
            context: context as unknown as AudioContext,
        });
        stream.release();
        expect(context.closed).toBe(false);
    });

    it("joins an existing graph through an AudioNode and leaves its other links alone", async () => {
        const context = new FakeContext();
        const source = new FakeNode(context);
        const stream = await createPcmStream(source as unknown as AudioNode, {
            onFrame: () => undefined,
        });
        stream.release();
        expect(source.disconnected).toEqual([FakeWorkletNode.last]);
        expect(context.closed).toBe(false);
    });

    it("loads the processor module once per context", async () => {
        const context = new FakeContext();
        const options = { onFrame: () => undefined, context: context as unknown as AudioContext };
        await Promise.all([
            createPcmStream({} as MediaStreamTrack, options),
            createPcmStream({} as MediaStreamTrack, options),
        ]);
        expect(context.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    });

    it("uses the app's worklet URL under a strict CSP, and retries after a failed load", async () => {
        const context = new FakeContext();
        FakeContext.failNext = true;
        const options = {
            onFrame: () => undefined,
            context: context as unknown as AudioContext,
            workletUrl: "/pcm-worklet.js",
        };
        await expect(createPcmStream({} as MediaStreamTrack, options)).rejects.toThrow(
            "blocked by CSP",
        );
        await createPcmStream({} as MediaStreamTrack, options);
        expect(context.modules).toEqual(["/pcm-worklet.js"]);
    });

    it("explains the CSP fix when the inline module is refused, and closes its context", async () => {
        FakeContext.failNext = true;
        const failure = createPcmStream({} as MediaStreamTrack, { onFrame: () => undefined });
        await expect(failure).rejects.toThrow(/script-src.*pcm-worklet\.js\?url/s);
        await expect(failure).rejects.toHaveProperty("cause.message", "blocked by CSP");
        expect(FakeContext.created).toBe(1);
    });

    it("refuses a stream with no audio track and invalid sizes", async () => {
        await expect(
            createPcmStream(new FakeStream([]) as unknown as MediaStream, {
                onFrame: () => undefined,
            }),
        ).rejects.toThrow(/audio track/);
        await expect(
            createPcmStream({} as MediaStreamTrack, { onFrame: () => undefined, frameSize: 0 }),
        ).rejects.toThrow(RangeError);
    });

    it("reports support from AudioWorkletNode and the secure context", () => {
        expect(isPcmStreamSupported()).toBe(true);
        vi.stubGlobal("AudioWorkletNode", undefined);
        expect(isPcmStreamSupported()).toBe(false);
    });
});

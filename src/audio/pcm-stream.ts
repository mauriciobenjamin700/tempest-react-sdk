import { createSincResampler } from "./resample";

/**
 * Live microphone audio as fixed-size frames at a model's sample rate.
 */

/** Name the processor registers under; versioned so a changed source never collides. */
const PROCESSOR_NAME = "tempest-pcm-framer-v1";

/** Where a frame sits in the stream. */
export interface PcmFrameInfo {
    /** 0-based frame counter. */
    index: number;
    /** Start of the frame in milliseconds of delivered audio (paused time excluded). */
    startMs: number;
}

/** Options for {@link createPcmStream}. */
export interface PcmStreamOptions {
    /** Called on the main thread with every frame, in order. The array is yours to keep. */
    onFrame: (frame: Float32Array, info: PcmFrameInfo) => void;
    /** Output sample rate in Hz. Default `16000`. */
    sampleRate?: number;
    /** Samples per frame. Default `512` (32 ms at 16 kHz — one Silero VAD step). */
    frameSize?: number;
    /** Samples between frame starts. Default `frameSize` (no overlap). */
    hopSize?: number;
    /**
     * Context to run in when `source` is a track or stream. Default: a new
     * `AudioContext`, closed on `release()`. Ignored for an `AudioNode`
     * source, which already belongs to one.
     */
    context?: AudioContext;
    /**
     * URL of the processor module, for a Content-Security-Policy whose
     * `script-src` does not allow `blob:` (the one `tempestCsp()` generates).
     * With Vite: `import url from "tempest-react-sdk/pcm-worklet.js?url"`.
     * Default: an inline `blob:` URL.
     */
    workletUrl?: string;
}

/** A running frame stream. */
export interface PcmStream {
    readonly sampleRate: number;
    readonly frameSize: number;
    readonly hopSize: number;
    /** Stop delivering frames; audio arriving while paused is dropped, not queued. */
    pause(): void;
    /** Deliver frames again. */
    resume(): void;
    /** Disconnect everything, and close the context if this stream created it. */
    release(): void;
}

/**
 * Source text of the `AudioWorklet` processor behind {@link createPcmStream}.
 *
 * It embeds {@link createSincResampler} by its own source text, which is why
 * that function is kept free of imports and closures: inside the worklet
 * nothing from this bundle exists. The build writes this text to
 * `dist/pcm-worklet.js` (`tempest-react-sdk/pcm-worklet.js`), the file a
 * strict Content-Security-Policy needs; it is exported for bundlers without a
 * `?url` import, which can serve it themselves.
 *
 * @returns The JavaScript module text.
 */
export function pcmWorkletSource(): string {
    return `const createSincResampler = ${createSincResampler.toString()};
class TempestPcmFramer extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const settings = options.processorOptions;
        this.resampler = createSincResampler(sampleRate, settings.targetRate);
        this.frameSize = settings.frameSize;
        this.hopSize = settings.hopSize;
        this.pending = new Float32Array(0);
        this.running = true;
        this.stopped = false;
        this.port.onmessage = (event) => {
            if (event.data === "pause") this.running = false;
            else if (event.data === "resume") this.running = true;
            else if (event.data === "stop") this.stopped = true;
        };
    }
    process(inputs) {
        if (this.stopped) return false;
        const input = inputs[0];
        if (!this.running || !input || input.length === 0) return true;
        const length = input[0].length;
        const mono = new Float32Array(length);
        for (const channel of input) for (let i = 0; i < length; i += 1) mono[i] += channel[i];
        if (input.length > 1) for (let i = 0; i < length; i += 1) mono[i] /= input.length;
        const converted = this.resampler.process(mono);
        if (converted.length === 0) return true;
        const joined = new Float32Array(this.pending.length + converted.length);
        joined.set(this.pending, 0);
        joined.set(converted, this.pending.length);
        let offset = 0;
        while (joined.length - offset >= this.frameSize) {
            const frame = joined.slice(offset, offset + this.frameSize);
            this.port.postMessage(frame, [frame.buffer]);
            offset += this.hopSize;
        }
        this.pending = joined.slice(Math.min(offset, joined.length));
        return true;
    }
}
registerProcessor("${PROCESSOR_NAME}", TempestPcmFramer);
`;
}

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();
let inlineUrl: string | null = null;

/**
 * Register the processor in a context once.
 *
 * `addModule` throws when a name is registered twice in the same context, and
 * two streams can be created in the same tick, so the in-flight promise is
 * shared per context and forgotten if it fails (a retry gets a clean attempt).
 *
 * @param context The context.
 * @param url Module URL.
 * @returns Resolves when the processor is available.
 */
function ensureProcessor(context: BaseAudioContext, url: string): Promise<void> {
    let ready = loaded.get(context);
    if (!ready) {
        ready = context.audioWorklet.addModule(url).catch((error: unknown) => {
            loaded.delete(context);
            throw error;
        });
        loaded.set(context, ready);
    }
    return ready;
}

/**
 * Whether this browser can run {@link createPcmStream}.
 *
 * @returns `true` with `AudioWorkletNode` in a secure context.
 */
export function isPcmStreamSupported(): boolean {
    return (
        typeof AudioWorkletNode !== "undefined" &&
        typeof AudioContext !== "undefined" &&
        (globalThis as { isSecureContext?: boolean }).isSecureContext !== false
    );
}

/**
 * Validate a size option.
 *
 * @param name Option name, for the message.
 * @param value The value.
 * @returns The value.
 * @throws RangeError for anything but a positive integer.
 */
function positiveInteger(name: string, value: number): number {
    if (!Number.isInteger(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive integer, got ${value}.`);
    }
    return value;
}

/**
 * Stream a microphone (or any audio node) to the main thread as fixed-size
 * mono frames at a model's sample rate.
 *
 * Resampling and framing run in an `AudioWorklet`, on the audio thread, with
 * the same band-limited filter as `decodeAudioToPcm` — so a model sees the
 * same spectrum live and from a file. The device's context usually runs at
 * 44.1 or 48 kHz and not every browser lets a context run at 16 kHz with a
 * microphone attached (Firefox refuses to connect nodes across rates), so the
 * context stays at its native rate and the conversion happens here. Measured
 * on Chromium 159 with a fake microphone: no frame lost or duplicated over the
 * run (sample count matches duration × rate within one render quantum).
 *
 * The processor node has no output, which keeps it processing without being
 * wired to the speakers.
 *
 * The module is loaded from an inline `blob:` URL by default. Worklets follow
 * `script-src`, not `worker-src`, and the CSP `tempestCsp()` generates does
 * not allow `blob:` there — measured on Chromium 159, the load then fails with
 * an `AbortError` naming nothing, which this function turns into an error that
 * names the fix: the package ships the same module as a file,
 * `tempest-react-sdk/pcm-worklet.js`, to pass as `workletUrl`.
 *
 * @param source A microphone track or stream, or an `AudioNode` already in a graph.
 * @param options Callback, rate and frame geometry.
 * @returns The running stream.
 * @throws RangeError for invalid sizes; Error when the stream has no audio track.
 *
 * @example
 * ```typescript
 * import { createPcmStream } from "tempest-react-sdk";
 *
 * async function listen(): Promise<() => void> {
 *     const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
 *     const stream = await createPcmStream(mic, {
 *         sampleRate: 16_000,
 *         frameSize: 512,
 *         onFrame: (frame, { index }) => console.log(index, frame.length),
 *     });
 *     return () => {
 *         stream.release();
 *         mic.getTracks().forEach((track) => track.stop());
 *     };
 * }
 * ```
 */
export async function createPcmStream(
    source: MediaStreamTrack | MediaStream | AudioNode,
    options: PcmStreamOptions,
): Promise<PcmStream> {
    const sampleRate = positiveInteger("sampleRate", options.sampleRate ?? 16_000);
    const frameSize = positiveInteger("frameSize", options.frameSize ?? 512);
    const hopSize = positiveInteger("hopSize", options.hopSize ?? frameSize);
    const { onFrame } = options;

    const isNode = typeof AudioNode !== "undefined" && source instanceof AudioNode;
    const ownsContext = !isNode && !options.context;
    const context: BaseAudioContext = isNode
        ? (source as AudioNode).context
        : (options.context ?? new AudioContext());

    let input: AudioNode;
    if (isNode) {
        input = source as AudioNode;
    } else {
        const stream =
            typeof MediaStream !== "undefined" && source instanceof MediaStream
                ? source
                : new MediaStream([source as MediaStreamTrack]);
        if (stream.getAudioTracks().length === 0) {
            if (ownsContext) void (context as AudioContext).close().catch(() => undefined);
            throw new Error("createPcmStream needs a stream with an audio track.");
        }
        input = (context as AudioContext).createMediaStreamSource(stream);
    }

    let url = options.workletUrl;
    if (!url) {
        inlineUrl ??= URL.createObjectURL(
            new Blob([pcmWorkletSource()], { type: "text/javascript" }),
        );
        url = inlineUrl;
    }
    try {
        await ensureProcessor(context, url);
    } catch (error) {
        if (!isNode) input.disconnect();
        if (ownsContext) void (context as AudioContext).close().catch(() => undefined);
        if (options.workletUrl) throw error;
        throw new Error(
            "createPcmStream could not load its AudioWorklet from a blob: URL. A Content-Security-" +
                "Policy whose script-src does not allow blob: (tempestCsp() does not) blocks it. " +
                'Pass workletUrl: import url from "tempest-react-sdk/pcm-worklet.js?url".',
            { cause: error },
        );
    }

    const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        processorOptions: { targetRate: sampleRate, frameSize, hopSize },
    });
    let index = 0;
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        const at = index;
        index += 1;
        onFrame(event.data, { index: at, startMs: (at * hopSize * 1000) / sampleRate });
    };
    input.connect(node);
    if ("resume" in context && context.state === "suspended") {
        void (context as AudioContext).resume().catch(() => undefined);
    }

    let released = false;
    return {
        sampleRate,
        frameSize,
        hopSize,
        pause: (): void => node.port.postMessage("pause"),
        resume: (): void => node.port.postMessage("resume"),
        release: (): void => {
            if (released) return;
            released = true;
            node.port.postMessage("stop");
            node.port.onmessage = null;
            input.disconnect(node);
            if (!isNode) input.disconnect();
            if (ownsContext) void (context as AudioContext).close().catch(() => undefined);
        },
    };
}

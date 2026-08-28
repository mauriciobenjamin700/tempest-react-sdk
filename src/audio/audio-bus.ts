/**
 * @tempest-limits file-lines — the mixing graph, the per-source handle and the
 * output route are one object's lifetime: the limiter only makes sense after the
 * sum, and the element that carries `setSinkId` is the same one the mix leaves
 * through. Splitting them would hand the caller two halves that are useless apart.
 */
import { isAudioOutputSelectionSupported, setAudioOutput } from "./audio-output";

/** Default ceiling for a per-source or master gain, as a multiplier. */
export const DEFAULT_MAX_GAIN = 3;

/** Shape of the master limiter. Matches `DynamicsCompressorNode`'s params. */
export interface LimiterSettings {
    /** dBFS above which the compressor starts working. */
    threshold: number;
    /** dB range over which the curve bends. `0` is a hard knee. */
    knee: number;
    /** Input/output ratio above the threshold. 20 is limiting, not compression. */
    ratio: number;
    /** Seconds to clamp a peak. */
    attack: number;
    /** Seconds to let go. */
    release: number;
}

/**
 * A limiter, not a compressor: a hard knee at a 20:1 ratio with a 3 ms attack
 * catches the sum before it clips without audibly ducking anything below it.
 */
const DEFAULT_LIMITER: LimiterSettings = {
    threshold: -8,
    knee: 0,
    ratio: 20,
    attack: 0.003,
    release: 0.25,
};

/** Options for {@link createAudioBus}. */
export interface AudioBusOptions {
    /** Ceiling for every gain on this bus. Default {@link DEFAULT_MAX_GAIN}. */
    maxGain?: number;
    /** Override the master limiter, or pass `false` to run without one. */
    limiter?: Partial<LimiterSettings> | false;
    /**
     * Reuse an existing `AudioContext` instead of creating one.
     *
     * Browsers cap the number of live contexts (Chrome allows around six), so a
     * page that already has one — a level meter, a player — should hand it over
     * rather than open a second.
     */
    context?: AudioContext;
}

/** One source attached to the bus. */
export interface AudioBusHandle {
    /**
     * Set this source's gain, where `1` is the level it arrived at.
     *
     * Values above `1` are the point of the whole graph: `element.volume` is
     * clamped at `1`, so a quiet talker could only ever be attenuated — the one
     * correction nobody needs.
     */
    setGain: (gain: number) => void;
    /** Current gain, after clamping. */
    readonly gain: number;
    /** Detach this source and release its nodes. The bus stays up. */
    stop: () => void;
}

/** A running mix. */
export interface AudioBus {
    /**
     * Play a stream through the shared mix.
     *
     * @param stream - The stream to play. Only its first audio track is used.
     * @param options - `gain` is the initial multiplier, default `1`.
     * @returns A handle to adjust or detach this source.
     */
    attach: (stream: MediaStream, options?: { gain?: number }) => AudioBusHandle;
    /** Scale every source, on top of its own gain. */
    setMasterGain: (gain: number) => void;
    /** Current master gain, after clamping. */
    readonly masterGain: number;
    /**
     * Route the whole mix to one output device.
     *
     * @param deviceId - Device id from `useMediaDevices().audioOutputs`, or `""`
     *   for the system default.
     * @returns `false` when the engine cannot route audio, or the device is gone.
     */
    setOutputDevice: (deviceId: string) => Promise<boolean>;
    /** Device id the mix is routed to. `""` is the system default. */
    readonly outputDevice: string;
    /**
     * Resume a context the browser started suspended.
     *
     * Autoplay policy suspends a context created outside a user gesture, and a
     * suspended context is silent with no error anywhere. Call this from the
     * click that starts playback.
     */
    resume: () => Promise<void>;
    /** Detach everything and close the context this bus created. */
    close: () => void;
    /** Whether this browser gave us a Web Audio graph at all. */
    readonly supported: boolean;
    /** Whether this browser can route the mix to a chosen output device. */
    readonly canSelectOutput: boolean;
}

/**
 * Clamp a gain into `0..max`, treating a non-finite value as unity.
 *
 * `NaN` reaches here from an empty input or a failed parse, and assigning it to
 * an `AudioParam` throws — losing the audio for a typo in a number field.
 */
function clampGain(gain: number, max: number): number {
    if (!Number.isFinite(gain)) return 1;
    return Math.min(max, Math.max(0, gain));
}

/** The `AudioContext` constructor this engine exposes, prefixed or not. */
function audioContextConstructor(): typeof AudioContext | undefined {
    if (typeof AudioContext !== "undefined") return AudioContext;
    return (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/** A media element that may support output routing. */
type SinkCapableElement = HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };

/**
 * The stream to feed the graph: just the audio track, when this engine can build
 * one.
 *
 * Isolating the track keeps a camera's video out of the source node. `MediaStream`
 * is missing outside a browser (jsdom, a worker), and there the original stream is
 * the right answer anyway — `createMediaStreamSource` reads its first audio track.
 */
function audioOnly(stream: MediaStream, track: MediaStreamTrack): MediaStream {
    if (typeof MediaStream === "undefined") return stream;
    return new MediaStream([track]);
}

/** Start playback without letting an environment that has no media pipeline throw. */
function playQuietly(element: HTMLAudioElement): void {
    try {
        void element.play?.()?.catch(() => undefined);
    } catch {
        /* jsdom and any engine without a media pipeline — nothing to play anyway */
    }
}

/**
 * Mix several streams into one output, with gain above 100% and a master limiter.
 *
 * Three things make this a graph instead of a few `<audio>` elements:
 *
 * 1. **`element.volume` is clamped at `1`.** A participant who speaks too quietly
 *    can only be turned *down* — the one correction nobody needs. A `GainNode`
 *    has no ceiling, so this bus takes one (`maxGain`, default 3).
 * 2. **Clipping is a property of the sum.** Three sources at 200% each are clean
 *    alone and distort the instant they play together. A per-source limiter
 *    cannot see that; the one after the mix can, which is where this puts it.
 * 3. **`setSinkId` lives on the element, not on the context.** Sending the mix to
 *    a headset while the rest of the system keeps the speakers is only reachable
 *    by leaving through a `MediaStreamAudioDestinationNode` into a real
 *    `<audio>`. `AudioContext.setSinkId` has far thinner support.
 *
 * @param options - See {@link AudioBusOptions}.
 * @returns The bus. On an engine with no Web Audio it is inert but callable, and
 *   `supported` is `false` — a page without sound beats a page that throws.
 *
 * @example
 * const bus = createAudioBus({ maxGain: 3 });
 * const handle = bus.attach(remoteStream, { gain: 1 });
 * handle.setGain(2.4);              // above 1 — the point of the whole thing
 * await bus.setOutputDevice(headsetId);
 */
export function createAudioBus({
    maxGain = DEFAULT_MAX_GAIN,
    limiter: limiterOptions,
    context: injectedContext,
}: AudioBusOptions = {}): AudioBus {
    const Ctor = audioContextConstructor();
    const context = injectedContext ?? (Ctor ? new Ctor() : null);

    if (!context) {
        return {
            attach: () => ({ setGain: () => undefined, gain: 1, stop: () => undefined }),
            setMasterGain: () => undefined,
            masterGain: 1,
            setOutputDevice: async () => false,
            outputDevice: "",
            resume: async () => undefined,
            close: () => undefined,
            supported: false,
            canSelectOutput: false,
        };
    }

    const graph = context;
    const ownsContext = !injectedContext;
    const master = graph.createGain();
    const destination = graph.createMediaStreamDestination();

    if (limiterOptions === false) {
        master.connect(destination);
    } else {
        const limiter = graph.createDynamicsCompressor();
        const settings = { ...DEFAULT_LIMITER, ...limiterOptions };
        limiter.threshold.value = settings.threshold;
        limiter.knee.value = settings.knee;
        limiter.ratio.value = settings.ratio;
        limiter.attack.value = settings.attack;
        limiter.release.value = settings.release;
        master.connect(limiter);
        limiter.connect(destination);
    }

    const element = new Audio();
    element.autoplay = true;
    element.srcObject = destination.stream;
    playQuietly(element);

    let sinkId = "";
    let masterGain = 1;
    const handles = new Set<AudioBusHandle>();

    /**
     * Play one stream through the mix.
     *
     * The muted `<audio>` anchor is not dead weight, and deleting it as unused is
     * the mistake this comment exists to prevent: Chrome will not pull samples
     * from a `MediaStreamAudioSourceNode` built over a **remote** WebRTC stream
     * unless that same stream is also attached to a media element
     * (crbug.com/687574). Without it the graph is visibly correct and completely
     * silent — a day of debugging for anyone who does not know the bug. It is
     * muted because the audible copy is the one leaving the bus.
     */
    function attach(stream: MediaStream, { gain = 1 }: { gain?: number } = {}): AudioBusHandle {
        const track = stream.getAudioTracks()[0];
        if (!track) return { setGain: () => undefined, gain: 1, stop: () => undefined };

        const anchor = new Audio();
        anchor.muted = true;
        anchor.autoplay = true;
        anchor.srcObject = stream;
        playQuietly(anchor);

        const source = graph.createMediaStreamSource(audioOnly(stream, track));
        const node = graph.createGain();
        let current = clampGain(gain, maxGain);
        node.gain.value = current;
        source.connect(node);
        node.connect(master);

        const handle: AudioBusHandle = {
            setGain(next: number): void {
                current = clampGain(next, maxGain);
                node.gain.value = current;
            },
            get gain(): number {
                return current;
            },
            stop(): void {
                if (!handles.has(handle)) return;
                handles.delete(handle);
                source.disconnect();
                node.disconnect();
                anchor.srcObject = null;
                anchor.pause();
            },
        };
        handles.add(handle);
        return handle;
    }

    return {
        attach,
        setMasterGain(gain: number): void {
            masterGain = clampGain(gain, maxGain);
            master.gain.value = masterGain;
        },
        get masterGain(): number {
            return masterGain;
        },
        async setOutputDevice(deviceId: string): Promise<boolean> {
            const applied = await setAudioOutput(element as SinkCapableElement, deviceId);
            if (applied) sinkId = deviceId;
            return applied;
        },
        get outputDevice(): string {
            return sinkId;
        },
        async resume(): Promise<void> {
            await graph.resume?.().catch(() => undefined);
        },
        close(): void {
            for (const handle of [...handles]) handle.stop();
            element.srcObject = null;
            element.pause();
            master.disconnect();
            if (ownsContext) void graph.close().catch(() => undefined);
        },
        supported: true,
        get canSelectOutput(): boolean {
            return isAudioOutputSelectionSupported();
        },
    };
}

import {
    compressorStage,
    deEsserStage,
    gateStage,
    highPassStage,
    hissCutStage,
    limiterStage,
    presenceStage,
} from "./voice-chain-stages";

/** Which stages a voice chain builds. */
export interface VoiceChainSettings {
    /** Cut everything below speech: fans, traffic rumble, desk knocks, plosives. */
    highPass: boolean;
    /** Silence the line when nobody is talking. */
    gate: boolean;
    /** RMS below which the gate closes, 0..1. See {@link suggestGateThreshold}. */
    gateThreshold: number;
    /** Even out the distance between a whisper and a shout. */
    compressor: boolean;
    /** Lift the consonant band so speech reads without getting louder. */
    presence: boolean;
    /** Roll off hiss above what speech uses. */
    hissCut: boolean;
    /** Ride down harsh S and CH sounds. */
    deEsser: boolean;
    /**
     * Hard ceiling before the signal leaves.
     *
     * On by default and worth leaving on: the leveller is 3:1, which controls the
     * average and lets a peak through, and `gain` can reach well above 1.
     */
    limiter: boolean;
}

/**
 * What a call wants before anybody touches a slider.
 *
 * High-pass, leveller and limiter only. Gate, presence, hiss cut and de-esser are
 * off because each has an audible cost when it is not needed — a gate set for the
 * wrong room clips words, presence on a bright microphone is harsh, and a de-esser
 * on a voice that does not hiss just dulls it.
 */
export const DEFAULT_VOICE_CHAIN: VoiceChainSettings = {
    highPass: true,
    gate: false,
    gateThreshold: 0.02,
    compressor: true,
    presence: false,
    hissCut: false,
    deEsser: false,
    limiter: true,
};

/** Options for {@link createVoiceChain}. */
export interface VoiceChainOptions {
    /** Output multiplier, applied after every stage and before the limiter. Default `1`. */
    gain?: number;
    /**
     * Reuse an existing `AudioContext` instead of creating one.
     *
     * Browsers cap live contexts (Chrome allows around six), so a page that already
     * has one — a level meter, an audio bus — should hand it over.
     */
    context?: AudioContext;
    /**
     * Whether `release()` also stops `source`. Default `true`.
     *
     * Pass `false` when the track belongs to somebody else: a settings dialog
     * building a second chain over its live preview would otherwise kill the meter
     * the person is watching while they listen.
     */
    ownsSource?: boolean;
}

/** A running voice chain. */
export interface VoiceChain {
    /** The processed track to publish. */
    track: MediaStreamTrack;
    /** Stop the detectors, disconnect the graph, and release the track. */
    release: () => void;
    /**
     * Whether a graph was actually built.
     *
     * `false` when this engine has no Web Audio, and also when the settings asked
     * for nothing — in both cases `track` is `source`, untouched.
     */
    readonly supported: boolean;
}

/** The `AudioContext` constructor this engine exposes, prefixed or not. */
function audioContextConstructor(): typeof AudioContext | undefined {
    if (typeof AudioContext !== "undefined") return AudioContext;
    return (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/**
 * Whether any of this would change the signal.
 *
 * A chain that only passes audio through still costs a re-encode and a handful of
 * nodes, so a caller that rebuilds on every settings change should ask first —
 * and {@link createVoiceChain} asks too, handing back `source` rather than
 * building a graph that does nothing.
 *
 * @param settings - The stages under consideration.
 * @param gain - The output multiplier that would be applied. Default `1`.
 * @returns `true` when the chain would be audibly transparent.
 */
export function isVoiceChainIdle(settings: VoiceChainSettings, gain = 1): boolean {
    return (
        !settings.highPass &&
        !settings.gate &&
        !settings.compressor &&
        !settings.presence &&
        !settings.hissCut &&
        !settings.deEsser &&
        !settings.limiter &&
        gain === 1
    );
}

/** A chain that owns nothing, for an engine or a settings object with no work to do. */
function passThrough(source: MediaStreamTrack, ownsSource: boolean): VoiceChain {
    return {
        track: source,
        release: () => {
            if (ownsSource) source.stop();
        },
        supported: false,
    };
}

/**
 * Build the processing a microphone is published through.
 *
 * Ordered the way a console is: cut what is not speech, gate what is left, level
 * it, shape it, set how loud it goes out, then hold a ceiling. **The order is not
 * cosmetic.** Gating before the high-pass lets a rumble hold the gate open;
 * compressing before the gate lifts the noise floor up to meet the threshold; and
 * a limiter placed before the output gain is a ceiling the gain then walks
 * straight through.
 *
 * This sits *after* the browser's own echo cancellation and noise suppression,
 * which stay on: the two solve different problems. The browser's is trained on
 * stationary noise inside the capture pipeline; this cuts what it leaves behind
 * and decides when the line should be silent at all.
 *
 * @param source - The captured microphone track.
 * @param settings - Which stages to build. Default {@link DEFAULT_VOICE_CHAIN}.
 * @param options - See {@link VoiceChainOptions}.
 * @returns The track to publish plus its teardown. On an engine with no Web Audio,
 *   and when every stage is off, the source track is handed back untouched and
 *   `supported` is `false` — a call without processing beats a call that throws.
 *   The idle case is decided **before** a context is opened, because browsers cap
 *   how many can be live and one built for a chain that does nothing still counts.
 *
 * @example
 * const floor = await measureNoiseFloor(stream);
 * const chain = createVoiceChain(micTrack, {
 *     ...DEFAULT_VOICE_CHAIN,
 *     gate: true,
 *     gateThreshold: suggestGateThreshold(floor),
 * }, { gain: 1.4 });
 * await mesh.setLocalTrack("mic", chain.track);
 */
export function createVoiceChain(
    source: MediaStreamTrack,
    settings: VoiceChainSettings = DEFAULT_VOICE_CHAIN,
    { gain = 1, context: injectedContext, ownsSource = true }: VoiceChainOptions = {},
): VoiceChain {
    if (isVoiceChainIdle(settings, gain)) return passThrough(source, ownsSource);

    const Ctor = audioContextConstructor();
    const context = injectedContext ?? (Ctor ? new Ctor() : null);
    if (!context) return passThrough(source, ownsSource);

    const input = context.createMediaStreamSource(
        typeof MediaStream === "undefined"
            ? (source as unknown as MediaStream)
            : new MediaStream([source]),
    );
    const built: AudioNode[] = [input];
    const stops: (() => void)[] = [];
    let node: AudioNode = input;

    const chain = (next: AudioNode): void => {
        node.connect(next);
        node = next;
        built.push(next);
    };

    if (settings.highPass) chain(highPassStage(context));

    if (settings.gate) {
        const stage = gateStage(context, () => settings.gateThreshold);
        node.connect(stage.detector);
        built.push(stage.detector);
        stops.push(stage.stop);
        chain(stage.gain);
    }

    if (settings.compressor) chain(compressorStage(context));
    if (settings.presence) chain(presenceStage(context));
    if (settings.hissCut) chain(hissCutStage(context));

    if (settings.deEsser) {
        const stage = deEsserStage(context);
        node.connect(stage.band);
        built.push(stage.band, stage.detector);
        stops.push(stage.stop);
        chain(stage.shaper);
    }

    const output = context.createGain();
    output.gain.value = gain;
    chain(output);

    if (settings.limiter) chain(limiterStage(context));

    const destination = context.createMediaStreamDestination();
    node.connect(destination);
    built.push(destination);
    const track = destination.stream.getAudioTracks()[0];

    const teardown = (): void => {
        for (const stop of stops) stop();
        for (const built_ of built) built_.disconnect();
    };

    if (!track) {
        teardown();
        return passThrough(source, ownsSource);
    }

    return {
        track,
        release: (): void => {
            teardown();
            track.stop();
            if (ownsSource) source.stop();
        },
        supported: true,
    };
}

/** A running monitor. */
export interface VoiceMonitor {
    /** Stop listening and release the graph. Does **not** stop the source track. */
    stop: () => void;
}

/**
 * Play your own processed microphone back to you.
 *
 * The only way to hear what these filters do without a second person on the call.
 * Every number the chain is tuned by — how deep the de-esser cuts, where the gate
 * sits, how much presence is too much — is a judgement made by ear, and without
 * this the only available ear belongs to somebody else.
 *
 * **Feedback is the hazard, and the reason this is a held, explicit action rather
 * than a setting:** without headphones the speakers feed the microphone that feeds
 * the speakers. Say so in the UI that offers it.
 *
 * @param source - The raw captured track to listen to. It is never stopped here.
 * @param settings - The stages to hear it through. Default {@link DEFAULT_VOICE_CHAIN}.
 * @param options - See {@link VoiceChainOptions}; `ownsSource` is forced to `false`.
 * @returns A handle that stops the monitor.
 */
export function monitorVoiceChain(
    source: MediaStreamTrack,
    settings: VoiceChainSettings = DEFAULT_VOICE_CHAIN,
    options: Omit<VoiceChainOptions, "ownsSource"> = {},
): VoiceMonitor {
    const Ctor = audioContextConstructor();
    const context = options.context ?? (Ctor ? new Ctor() : null);
    if (!context) return { stop: () => undefined };

    const chain = createVoiceChain(source, settings, { ...options, context, ownsSource: false });
    const playback = context.createMediaStreamSource(
        typeof MediaStream === "undefined"
            ? (chain.track as unknown as MediaStream)
            : new MediaStream([chain.track]),
    );
    playback.connect(context.destination);

    return {
        stop: (): void => {
            playback.disconnect();
            chain.release();
        },
    };
}

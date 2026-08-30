/**
 * The individual stages a voice chain is built from, and the two side-chains
 * Web Audio cannot express declaratively.
 *
 * Split out of `voice-chain.ts` because every number here is a tuning decision
 * with a reason attached, and the file that assembles them should read as the
 * signal path rather than as a wall of constants.
 */

/** Everything below this is rumble, not speech. */
const HIGH_PASS_HZ = 85;

/** Where consonants live — the band that decides whether a word is understood. */
const PRESENCE_HZ = 3000;
const PRESENCE_GAIN_DB = 3;
const PRESENCE_Q = 1;

/** Where microphone hiss lives, above anything speech needs. */
const HISS_HZ = 9000;

/** The sibilance band a de-esser rides. */
const SIBILANCE_HZ = 7000;
const SIBILANCE_Q = 2;

/** Deepest cut the de-esser applies, in dB. */
const DEESSER_MAX_CUT_DB = 10;

/** Band energy above which the cut starts, as RMS. */
const DEESSER_THRESHOLD = 0.02;

/** How steeply the cut follows the band's energy above the threshold. */
const DEESSER_SLOPE_DB_PER_RMS = 200;

/** Seconds the de-esser takes to reach a new cut. */
const DEESSER_SMOOTHING = 0.02;

/**
 * A leveller, not a limiter: 3:1 with a soft knee evens out the distance between
 * a whisper and a shout without audibly pumping.
 */
const COMPRESSOR = {
    threshold: -24,
    knee: 30,
    ratio: 3,
    attack: 0.003,
    release: 0.25,
} as const;

/**
 * The ceiling the limiter holds, in dB relative to full scale.
 *
 * Just under zero, because digital clipping is not a degradation the other end
 * can recover from — it arrives as squared-off samples that no amount of
 * processing undoes.
 */
const LIMITER = {
    threshold: -1,
    knee: 0,
    ratio: 20,
    attack: 0.001,
    release: 0.1,
} as const;

/** How often the gate and the de-esser look at the signal, in milliseconds. */
export const DETECTOR_POLL_MS = 20;

/** Time constant for opening the gate. Short, so a first syllable survives. */
const GATE_ATTACK = 0.005;

/** Time constant for closing it. Long, so a word does not end abruptly. */
const GATE_RELEASE = 0.12;

/**
 * How long the gate stays open after the level drops.
 *
 * RMS falls to nothing between syllables, so a gate without hold chops speech
 * into pieces — it closes inside a word and reopens on the next one. This is the
 * difference between a gate that works and one everybody turns off again.
 */
export const GATE_HOLD_MS = 220;

/** The window each detector reads. */
const DETECTOR_FFT_SIZE = 1024;

/**
 * Root-mean-square of a time-domain window.
 *
 * RMS rather than peak because both detectors here answer "how much energy is
 * there", not "did one sample spike": a peak reading opens a gate on a keyboard
 * click and drives a de-esser off a single transient.
 *
 * @param buffer - Time-domain samples, -1..1.
 * @returns The window's RMS, 0..1.
 */
function rms(buffer: Float32Array): number {
    let sum = 0;
    for (const sample of buffer) sum += sample * sample;
    return Math.sqrt(sum / buffer.length);
}

/** Build the analyser both detectors read through. */
function detectorFor(context: AudioContext): AnalyserNode {
    const analyser = context.createAnalyser();
    analyser.fftSize = DETECTOR_FFT_SIZE;
    return analyser;
}

/** A high-pass at 85 Hz: fans, traffic, desk knocks, plosives. */
export function highPassStage(context: AudioContext): BiquadFilterNode {
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = HIGH_PASS_HZ;
    return filter;
}

/** A 3:1 leveller with a soft knee. */
export function compressorStage(context: AudioContext): DynamicsCompressorNode {
    const comp = context.createDynamicsCompressor();
    comp.threshold.value = COMPRESSOR.threshold;
    comp.knee.value = COMPRESSOR.knee;
    comp.ratio.value = COMPRESSOR.ratio;
    comp.attack.value = COMPRESSOR.attack;
    comp.release.value = COMPRESSOR.release;
    return comp;
}

/** A +3 dB peak at 3 kHz: speech that reads without getting louder. */
export function presenceStage(context: AudioContext): BiquadFilterNode {
    const eq = context.createBiquadFilter();
    eq.type = "peaking";
    eq.frequency.value = PRESENCE_HZ;
    eq.Q.value = PRESENCE_Q;
    eq.gain.value = PRESENCE_GAIN_DB;
    return eq;
}

/** A low-pass at 9 kHz: the hiss of a cheap microphone. */
export function hissCutStage(context: AudioContext): BiquadFilterNode {
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = HISS_HZ;
    return filter;
}

/** A hard 20:1 ceiling at -1 dBFS, placed after the output gain. */
export function limiterStage(context: AudioContext): DynamicsCompressorNode {
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = LIMITER.threshold;
    limiter.knee.value = LIMITER.knee;
    limiter.ratio.value = LIMITER.ratio;
    limiter.attack.value = LIMITER.attack;
    limiter.release.value = LIMITER.release;
    return limiter;
}

/** The nodes a gate stage owns. */
export interface GateStage {
    /** Reads the signal entering the gate. */
    detector: AnalyserNode;
    /** The gain the detector drives, 0 when closed. */
    gain: GainNode;
    /** Stop the detector's timer. */
    stop: () => void;
}

/**
 * Silence the line between phrases, without cutting inside a word.
 *
 * Measured on a timer rather than in an `AudioWorklet`. A worklet would gate
 * sample-accurately at the cost of a separate module file the consumer has to
 * serve and a second graph to keep in sync; at 20 ms the difference is inaudible
 * for speech, because the hold and the release are an order of magnitude longer
 * than the polling interval and are what actually shape how a gate sounds.
 *
 * The gate starts closed and opens on the first window over the threshold, so a
 * chain built while the room is quiet does not leak the first 20 ms of it.
 *
 * @param context - The graph's context.
 * @param threshold - Read on every tick, so the caller can move a slider while
 *     the chain is live rather than rebuild it.
 * @returns The stage's nodes and its teardown.
 */
export function gateStage(context: AudioContext, threshold: () => number): GateStage {
    const detector = detectorFor(context);
    const gain = context.createGain();
    gain.gain.value = 0;

    const buffer = new Float32Array(detector.fftSize);
    let lastLoudAt = 0;

    const timer = setInterval(() => {
        detector.getFloatTimeDomainData(buffer);
        const now = performance.now();
        if (rms(buffer) >= threshold()) lastLoudAt = now;
        const open = lastLoudAt > 0 && now - lastLoudAt < GATE_HOLD_MS;
        gain.gain.setTargetAtTime(
            open ? 1 : 0,
            context.currentTime,
            open ? GATE_ATTACK : GATE_RELEASE,
        );
    }, DETECTOR_POLL_MS);

    return { detector, gain, stop: () => clearInterval(timer) };
}

/** The nodes a de-esser stage owns. */
export interface DeEsserStage {
    /** Band-pass feeding the detector — the side-chain's input. */
    band: BiquadFilterNode;
    /** Reads 6-8 kHz only. */
    detector: AnalyserNode;
    /** The peaking filter in the signal path, whose gain rides the band. */
    shaper: BiquadFilterNode;
    /** Stop the detector's timer. */
    stop: () => void;
}

/**
 * Pull the sibilance band down while it is loud, and let go when it is not.
 *
 * Web Audio has no side-chain, so the detector is built by hand: a band-pass
 * feeds an analyser watching only 6-8 kHz, and that analyser's energy drives the
 * gain of a peaking filter sitting in the main path. The distinction is the whole
 * stage — the cut has to answer to the *band*, not to how loud the person is. A
 * static cut at the same frequency would dull every consonant instead of the
 * syllables that actually hiss.
 *
 * @param context - The graph's context.
 * @returns The stage's nodes and its teardown.
 */
export function deEsserStage(context: AudioContext): DeEsserStage {
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = SIBILANCE_HZ;
    band.Q.value = SIBILANCE_Q;

    const detector = detectorFor(context);
    band.connect(detector);

    const shaper = context.createBiquadFilter();
    shaper.type = "peaking";
    shaper.frequency.value = SIBILANCE_HZ;
    shaper.Q.value = SIBILANCE_Q;
    shaper.gain.value = 0;

    const buffer = new Float32Array(detector.fftSize);
    const timer = setInterval(() => {
        detector.getFloatTimeDomainData(buffer);
        const over = Math.max(0, rms(buffer) - DEESSER_THRESHOLD);
        const cut = Math.min(DEESSER_MAX_CUT_DB, over * DEESSER_SLOPE_DB_PER_RMS);
        shaper.gain.setTargetAtTime(-cut, context.currentTime, DEESSER_SMOOTHING);
    }, DETECTOR_POLL_MS);

    return { band, detector, shaper, stop: () => clearInterval(timer) };
}

export { rms as windowRms };

import { createLevelMeter } from "./level-meter";

/** RMS at which a window counts as speech. */
const DEFAULT_THRESHOLD = 0.045;

/**
 * How long the indicator stays on after the level drops.
 *
 * RMS falls to nothing in the gaps between words, so a bare threshold strobes on
 * every one of them. Ported from `tempest-mirror-screen`'s `voiceActivity.ts`,
 * where it was arrived at by watching a real call.
 */
const DEFAULT_RELEASE_MS = 350;

/** How often the level is read. */
const DEFAULT_POLL_MS = 100;

/** Options for {@link monitorVoiceActivity}. */
export interface VoiceActivityOptions {
    /** RMS at or above which a window counts as speech. Default `0.045`. */
    threshold?: number;
    /** How long the state stays `true` after the level drops. Default `350`. */
    releaseMs?: number;
    /** How often the level is sampled, in ms. Default `100`. */
    pollMs?: number;
    /**
     * Reuse an existing `AudioContext` instead of creating one.
     *
     * A monitor per remote participant hits the browser's cap on live contexts
     * (Chrome allows around six) in a five-person call. Open one and share it.
     */
    context?: AudioContext;
}

/** A running voice-activity monitor. */
export interface VoiceActivityMonitor {
    /** Whether the track is currently carrying speech. */
    readonly speaking: boolean;
    /** Stop sampling and release the analysis graph. */
    stop: () => void;
}

/**
 * Report when a track is carrying speech.
 *
 * Runs entirely on the **receiving** side, over a track the connection already
 * delivers, and that is the whole point: a speaking indicator changes several
 * times per second, so signalling it through a server floods the room with
 * messages carrying information every client can derive for free.
 *
 * Two details separate this from a threshold on a level meter:
 *
 * 1. **The release.** RMS drops to nothing in the gaps between words, so a bare
 *    comparison strobes on every syllable. The state only falls after
 *    `releaseMs` of quiet.
 * 2. **`onChange` fires on the flip, not on the sample.** A callback per poll
 *    would re-render a participant list ten times a second to say the same thing.
 *
 * The meter underneath runs with smoothing off: its eased decay plus this release
 * would hold the indicator open long after the speech stopped.
 *
 * @param stream - The stream whose first audio track is measured.
 * @param onChange - Called only when the speaking state actually flips.
 * @param options - See {@link VoiceActivityOptions}.
 * @returns A handle carrying the current state and the teardown.
 *
 * @example
 * const vad = monitorVoiceActivity(remoteStream, (speaking) => setSpeaking(speaking));
 * // later
 * vad.stop();
 */
export function monitorVoiceActivity(
    stream: MediaStream,
    onChange: (speaking: boolean) => void,
    {
        threshold = DEFAULT_THRESHOLD,
        releaseMs = DEFAULT_RELEASE_MS,
        pollMs = DEFAULT_POLL_MS,
        context,
    }: VoiceActivityOptions = {},
): VoiceActivityMonitor {
    const meter = createLevelMeter(stream, { decay: 0, ...(context ? { context } : {}) });
    let speaking = false;
    let lastLoudAt = 0;

    const timer = setInterval(() => {
        const now = performance.now();
        if (meter.level() >= threshold) lastLoudAt = now;
        const next = lastLoudAt > 0 && now - lastLoudAt < releaseMs;
        if (next === speaking) return;
        speaking = next;
        onChange(speaking);
    }, pollMs);

    return {
        get speaking(): boolean {
            return speaking;
        },
        stop: (): void => {
            clearInterval(timer);
            meter.stop();
        },
    };
}

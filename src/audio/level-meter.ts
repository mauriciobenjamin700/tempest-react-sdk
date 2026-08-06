/** Options for {@link createLevelMeter}. */
export interface LevelMeterOptions {
    /**
     * FFT window. 1024 is a good default: ~21 ms at 48 kHz, long enough to be stable
     * and short enough to react to a syllable.
     */
    fftSize?: number;
    /**
     * Extra smoothing on the way down, 0–1. Default `0.7`.
     *
     * A raw RMS reading is jittery enough to make a meter look broken. Attack is left
     * instant — a meter that lags the voice going *up* reads as "not recording" —
     * while the decay is eased, which is how every hardware meter behaves.
     */
    decay?: number;
}

/** A running level meter. */
export interface LevelMeter {
    /** Latest level, 0–1. Read it on your own frame loop. */
    level: () => number;
    /** Stop sampling and release the Web Audio graph. */
    stop: () => void;
}

/**
 * Sample the loudness of a live stream, 0–1.
 *
 * This exists because a recorder with no visible level is indistinguishable from a
 * broken one. A muted OS input, a headset whose mic arm is switched off, the wrong
 * device selected — all three produce a perfectly successful recording of silence,
 * and the user only finds out after they finish talking.
 *
 * The value is RMS, not peak: peak reacts to a single sample and flickers, RMS tracks
 * perceived loudness. It is deliberately **not** React state — updating state per
 * frame would re-render the tree 60 times a second. Poll `level()` from a
 * `requestAnimationFrame` loop and write to the DOM, or read it inside an existing
 * animation.
 *
 * The `AudioContext` is created here and closed by `stop()`. Browsers cap the number
 * of live contexts (Chrome allows around six), so a meter left running on unmount
 * eventually breaks every later one on the page.
 *
 * `level()` applies instant attack and eased release: a value above the current one
 * is taken as is, a lower one decays by `decay`. A meter that fell as fast as it rose
 * reads as noise instead of as loudness.
 *
 * @tempest-limits empty-catch — `stop()` disconnects nodes whose context may already
 * be closed (the tab was backgrounded, the stream's track ended, `stop()` raced an
 * unmount), and a disconnect on a dead graph throws. There is nothing to report and
 * nothing to retry: the resource this call would have released is already gone, and
 * the `context.close()` right after it is what actually matters.
 *
 * @param stream - A live audio stream.
 * @param options - See {@link LevelMeterOptions}.
 * @returns A `level()` reader and a `stop()`.
 *
 * @example
 * const meter = createLevelMeter(stream);
 * const tick = () => { bar.style.transform = `scaleX(${meter.level()})`; raf = requestAnimationFrame(tick); };
 */
export function createLevelMeter(
    stream: MediaStream,
    { fftSize = 1024, decay = 0.7 }: LevelMeterOptions = {},
): LevelMeter {
    const Ctor: typeof AudioContext | undefined =
        typeof AudioContext !== "undefined"
            ? AudioContext
            : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!Ctor) {
        return { level: () => 0, stop: () => undefined };
    }

    const context = new Ctor();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = fftSize;
    source.connect(analyser);

    const samples = new Float32Array(analyser.fftSize);
    let smoothed = 0;
    let closed = false;

    const read = (): number => {
        if (closed) return 0;
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let index = 0; index < samples.length; index += 1) {
            sum += samples[index] * samples[index];
        }
        const rms = Math.sqrt(sum / samples.length);
        smoothed = rms > smoothed ? rms : smoothed * decay + rms * (1 - decay);
        return Math.min(1, smoothed);
    };

    return {
        level: read,
        stop: (): void => {
            if (closed) return;
            closed = true;
            try {
                source.disconnect();
                analyser.disconnect();
            } catch {
                /* empty */
            }
            void context.close().catch(() => undefined);
        },
    };
}

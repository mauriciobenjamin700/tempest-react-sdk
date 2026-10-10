import { RnnoiseWorkletNode, loadRnnoise } from "@sapphi-red/web-noise-suppressor";

/**
 * Where the suppressor's three pieces live, as URLs a bundler hands over.
 *
 * The `@sapphi-red/web-noise-suppressor` package ships the runnable assets next
 * to its code, but it cannot say where they are from inside a library: the
 * `?url` suffix that resolves a module to its served address is a bundler
 * feature, and every bundler answers it differently. So this subpath takes the
 * three resolved addresses as arguments and does the honest part — the graph,
 * the load-once semantics, the per-context registration — here.
 */
export interface NeuralSuppressorAssets {
    /**
     * The `AudioWorklet` processor module the model runs its DSP in
     * (`rnnoiseWorklet.js`).
     */
    workletUrl: string;
    /** The SIMD build of the model's wasm (`rnnoise_simd.wasm`). */
    simdWasmUrl: string;
    /** The baseline build, used where the engine lacks SIMD (`rnnoise.wasm`). */
    wasmUrl: string;
}

/**
 * Whether this browser can run a worklet-based noise suppressor.
 *
 * Answered from the two things the path needs that nothing but the platform can
 * supply: `AudioWorkletNode` runs custom DSP on the audio thread, and a secure
 * context is what the browser requires before letting a module near the
 * microphone graph. Everything else — the models, the wasm — ships with the
 * caller, so it cannot be missing. The context must also run at 48 kHz, which
 * is checked at build time rather than here because the caller owns how its
 * context was opened.
 *
 * Deliberately conservative: anything it cannot establish answers `false`, and
 * a `false` sends the caller back to the browser's own `noiseSuppression`
 * constraint, which is weaker but always there.
 *
 * @returns True when a neural suppressor can be built on top of a capture.
 */
export function isNeuralSuppressionSupported(): boolean {
    return (
        typeof AudioWorkletNode !== "undefined" &&
        typeof window !== "undefined" &&
        window.isSecureContext
    );
}

/**
 * The one wasm binary every suppressor shares, fetched once.
 *
 * `loadRnnoise` compiles the whole model, and the answer is identical for every
 * graph that opens afterwards — a mesh can build a suppressor per published
 * track and a settings dialog may build a second for its monitor within a
 * single frame. Held as the promise rather than the result so the first two
 * callers race into one fetch instead of two. Reset on failure, so the next
 * call retries instead of replaying a dead promise.
 */
let loadingBinary: Promise<ArrayBuffer> | null = null;

/**
 * The contexts the worklet module has already been registered on, mapped to the
 * registration's own promise.
 *
 * `addModule` is per-context and throws on a name it already holds, so the
 * module records the moment a context is ready and skips the call next time.
 * The promise is what makes a fast caller that cannot wait — a mesh can open a
 * microphone and a preview within a single frame — race into one `addModule`
 * instead of two: had this been a set, the second caller would see the context
 * absent while the first was still awaiting and register the module twice.
 * Mapped to a promise rather than the module itself the way the wasm is,
 * because the registration belongs to one context while the wasm is shared,
 * and nothing here should keep a dead context alive — the value is dropped
 * with the context. On failure the entry is removed, so the next attempt
 * actually retries instead of replaying the broken registration.
 */
const readyContexts = new WeakMap<AudioContext, Promise<void>>();

/**
 * The compiled model for this context, loading what is not ready yet.
 *
 * Idempotent across calls: the wasm fetch and the module registration both
 * happen exactly once. The wasm is shared by every suppressor, while the module
 * registration belongs to one context.
 *
 * @param context - The context the suppression graph will run in.
 * @param assets - The resolved asset addresses from {@link NeuralSuppressorAssets}.
 * @returns The compiled model binary, ready to hand to a worklet node.
 * @throws Whatever the fetch or the compile threw, for the caller to fall back on.
 */
export async function prepareNeuralSuppressor(
    context: AudioContext,
    assets: NeuralSuppressorAssets,
): Promise<ArrayBuffer> {
    let ready = readyContexts.get(context);
    if (!ready) {
        ready = context.audioWorklet.addModule(assets.workletUrl).then(
            () => undefined,
            (error: unknown) => {
                readyContexts.delete(context);
                throw error;
            },
        );
        readyContexts.set(context, ready);
    }
    await ready;
    if (loadingBinary === null) {
        loadingBinary = loadRnnoise({ url: assets.wasmUrl, simdUrl: assets.simdWasmUrl }).catch(
            (error: unknown) => {
                loadingBinary = null;
                throw error;
            },
        );
    }
    return loadingBinary;
}

/**
 * A denoised track plus the graph that has to come down with it.
 *
 * `track` is not the captured one — it is the output of a `MediaStream`
 * destination the worklet feeds — so stopping the published track is not enough
 * to free the microphone. `release` closes the graph; the captured track behind
 * it belongs to the caller.
 */
export interface NeuralSuppressor {
    /** The track to publish in place of the captured one. */
    track: MediaStreamTrack;
    /** Tears the graph down. Does not stop the source track it was built from. */
    release(): void;
}

/**
 * Build a suppressor graph on top of a captured microphone track.
 *
 * The model runs on the audio thread through an `AudioWorkletNode` — a
 * recurrent network trained on speech that separates a voice from everything
 * that is not one: keyboards, fans, traffic, a room full of people. The
 * browser's `noiseSuppression` constraint answers the same question with a
 * stationary-noise gate that either lets a transient through or eats the voice
 * with it.
 *
 * Prefer {@link prepareNeuralSuppressor} before the capture opens: the fallback
 * to the browser's own suppression is a `getUserMedia` constraint, and a
 * constraint cannot be added to a capture that already exists. A caller that
 * did not preload still works — the load happens here, idempotently.
 *
 * The model assumes 48 kHz. A context opened at any other rate answers `null`
 * before anything is fetched, because feeding speech samples of the wrong rate
 * into a network trained on 48 kHz produces mush, not a voice.
 *
 * Failure is not fatal and is reported as `null` — whether the wasm would not
 * load or the worklet node could not be built: by the time this runs the caller
 * has already committed to the neural path, so the honest outcome is a call
 * without suppression rather than a microphone that will not open. {@link
 * prepareNeuralSuppressor}, which exists to be called *before* the capture,
 * still throws so the caller can pick a different fallback while one is
 * reachable.
 *
 * @param context - The shared context, prepared at 48 kHz.
 * @param source - The captured microphone track.
 * @param assets - The resolved asset addresses from {@link NeuralSuppressorAssets}.
 * @param options - `maxChannels` is the channel count of the capture; the model
 *   is mono, and a stereo capture asks for two so a second channel is not lost.
 * @returns The denoised track and its teardown, or `null` when this context or
 *   this graph cannot host the suppressor.
 */
export async function createNeuralSuppressor(
    context: AudioContext,
    source: MediaStreamTrack,
    assets: NeuralSuppressorAssets,
    options: { maxChannels: number },
): Promise<NeuralSuppressor | null> {
    if (context.sampleRate !== 48_000) return null;

    let binary: ArrayBuffer;
    try {
        binary = await prepareNeuralSuppressor(context, assets);
    } catch {
        return null;
    }

    let node: RnnoiseWorkletNode;
    try {
        node = new RnnoiseWorkletNode(context, {
            maxChannels: options.maxChannels,
            wasmBinary: binary,
        });
    } catch {
        return null;
    }

    const input = context.createMediaStreamSource(new MediaStream([source]));
    const output = context.createMediaStreamDestination();
    input.connect(node);
    node.connect(output);

    const track = output.stream.getAudioTracks()[0];
    if (!track) {
        input.disconnect();
        node.disconnect();
        output.disconnect();
        node.destroy();
        return null;
    }
    track.contentHint = source.contentHint;

    return {
        track,
        release: () => {
            input.disconnect();
            node.disconnect();
            output.disconnect();
            node.destroy();
            track.stop();
        },
    };
}

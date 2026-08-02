/** Raw PCM ready to be wrapped in a RIFF container. */
export interface PcmAudio {
    /** One `Float32Array` per channel, samples in −1…1. */
    channels: readonly Float32Array[];
    sampleRate: number;
}

/** Options for {@link blobToWav}. */
export interface WavOptions {
    /**
     * Mix down to one channel. Default `false`.
     *
     * Worth turning on for speech headed to a server: a microphone recorded in stereo
     * carries two nearly identical channels and doubles the upload for nothing.
     */
    mono?: boolean;
    /**
     * Resample to this rate. Default: keep the source rate.
     *
     * 16000 is the rate most speech-to-text APIs want, and dropping 48 kHz to 16 kHz
     * removes two thirds of the bytes with no audible loss on voice.
     */
    sampleRate?: number;
}

/** Bytes per sample in the output. 16-bit PCM is what every decoder accepts. */
const BYTES_PER_SAMPLE = 2;

/**
 * Wrap PCM in a 16-bit RIFF/WAVE container.
 *
 * The header is the 44-byte canonical form: `RIFF` size, `WAVE`, a 16-byte `fmt `
 * chunk declaring format 1 (uncompressed PCM), then `data`. Samples are interleaved
 * and clamped before scaling, because a value even slightly past ±1 wraps around when
 * truncated to 16 bits and turns a loud passage into a burst of noise.
 *
 * Implemented here rather than pulled from a package: it is a fixed header and a
 * scaling loop, roughly forty lines, and a dependency for it would put its own
 * version bounds on every consumer of this SDK to save writing them.
 *
 * @param audio - Channels and sample rate.
 * @returns A `Blob` of type `audio/wav`.
 */
export function encodeWav({ channels, sampleRate }: PcmAudio): Blob {
    const channelCount = Math.max(1, channels.length);
    const frameCount = channels[0]?.length ?? 0;
    const dataBytes = frameCount * channelCount * BYTES_PER_SAMPLE;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);

    const ascii = (offset: number, text: string): void => {
        for (let index = 0; index < text.length; index += 1) {
            view.setUint8(offset + index, text.charCodeAt(index));
        }
    };

    const byteRate = sampleRate * channelCount * BYTES_PER_SAMPLE;
    ascii(0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, channelCount * BYTES_PER_SAMPLE, true);
    view.setUint16(34, BYTES_PER_SAMPLE * 8, true);
    ascii(36, "data");
    view.setUint32(40, dataBytes, true);

    let offset = 44;
    for (let frame = 0; frame < frameCount; frame += 1) {
        for (let channel = 0; channel < channelCount; channel += 1) {
            const sample = channels[channel]?.[frame] ?? 0;
            const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
            // Asymmetric scaling: 16-bit PCM runs −32768…32767.
            view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
            offset += BYTES_PER_SAMPLE;
        }
    }

    return new Blob([buffer], { type: "audio/wav" });
}

/** Average every channel of a decoded buffer into one. */
function mixToMono(buffer: AudioBuffer): Float32Array {
    const frames = buffer.length;
    const out = new Float32Array(frames);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let frame = 0; frame < frames; frame += 1) out[frame] += data[frame];
    }
    if (buffer.numberOfChannels > 1) {
        for (let frame = 0; frame < frames; frame += 1) out[frame] /= buffer.numberOfChannels;
    }
    return out;
}

/**
 * Convert a recording to 16-bit WAV, with no dependency.
 *
 * `MediaRecorder` cannot produce WAV — it emits Opus on Chromium and Firefox and AAC
 * on Safari — so a backend that insists on WAV has to be served either by a
 * server-side transcode or by this. It decodes through `AudioContext.decodeAudioData`,
 * which is the browser's own decoder for whatever container the recorder chose, then
 * re-encodes the PCM.
 *
 * !!! The cost is real: WAV is uncompressed, so the same voice note that is 40 KB in
 * Opus is roughly 500 KB here at 48 kHz stereo. `{ mono: true, sampleRate: 16000 }`
 * takes that to about 80 KB and is what a speech-to-text endpoint wants anyway.
 *
 * Resampling uses `OfflineAudioContext`, i.e. the browser's own resampler, rather
 * than a hand-rolled one — this is exactly the "we want the underlying call, not a
 * wrapper" case.
 *
 * @param blob - A recording from {@link createAudioRecorder}, or any decodable audio.
 * @param options - See {@link WavOptions}.
 * @returns A `Blob` of type `audio/wav`.
 * @throws When the environment has no Web Audio, or the blob cannot be decoded.
 */
export async function blobToWav(blob: Blob, options: WavOptions = {}): Promise<Blob> {
    const { mono = false, sampleRate: target } = options;

    const Ctor: typeof AudioContext | undefined =
        typeof AudioContext !== "undefined"
            ? AudioContext
            : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio is not available in this environment.");

    const context = new Ctor();
    let decoded: AudioBuffer;
    try {
        decoded = await context.decodeAudioData(await blob.arrayBuffer());
    } finally {
        void context.close().catch(() => undefined);
    }

    const wantedChannels = mono ? 1 : decoded.numberOfChannels;
    const wantedRate = target ?? decoded.sampleRate;

    if (wantedRate === decoded.sampleRate) {
        const channels = mono
            ? [mixToMono(decoded)]
            : Array.from({ length: decoded.numberOfChannels }, (_, index) =>
                  decoded.getChannelData(index),
              );
        return encodeWav({ channels, sampleRate: decoded.sampleRate });
    }

    const Offline: typeof OfflineAudioContext | undefined =
        typeof OfflineAudioContext !== "undefined" ? OfflineAudioContext : undefined;
    if (!Offline) throw new Error("Resampling requires OfflineAudioContext.");

    const frames = Math.max(1, Math.round((decoded.duration * wantedRate) | 0) || 1);
    const offline = new Offline(wantedChannels, frames, wantedRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();

    return encodeWav({
        channels: Array.from({ length: rendered.numberOfChannels }, (_, index) =>
            rendered.getChannelData(index),
        ),
        sampleRate: rendered.sampleRate,
    });
}

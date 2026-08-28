import { vi } from "vitest";

/**
 * Test doubles for the media APIs jsdom does not implement.
 *
 * All of them are **classes**, not `vi.fn(() => obj)`: the code under test uses `new
 * MediaRecorder(...)` and `new AudioContext()`, and a plain mock function is not a
 * constructor — it throws before any assertion runs.
 */

/**
 * `torch` is a real constrainable capability, but TypeScript's DOM lib lists it only on
 * `MediaTrackSettings`, so a fixture that describes a camera *with a lamp* has to widen
 * the capability type.
 */
export type TorchAwareCapabilities = MediaTrackCapabilities & { torch?: readonly boolean[] };

/**
 * A `MediaStreamTrack` that records whether it was stopped, and can be driven.
 *
 * Beyond `stop()` it carries the three things a capture surface reads off a live
 * track: `getSettings()` (the real frame size, `displaySurface`, the torch state),
 * `getCapabilities()` — which Firefox does not implement at all, hence
 * `hasCapabilities` — and the `ended` event, which is the **only** signal that the
 * user stopped a screen share from the browser's own bar.
 */
export class FakeTrack {
    stopped = false;
    kind: string;
    settings: MediaTrackSettings = {};
    capabilities: TorchAwareCapabilities = {};
    /** Applied constraint sets, in order, so a torch call can be asserted. */
    applied: MediaTrackConstraints[] = [];
    /** Make `applyConstraints` reject, as a camera with no lamp does. */
    applyShouldReject = false;
    getCapabilities?: () => TorchAwareCapabilities;

    private listeners = new Map<string, Set<() => void>>();

    constructor(kind = "audio", hasCapabilities = true) {
        this.kind = kind;
        if (hasCapabilities) this.getCapabilities = () => this.capabilities;
    }

    stop(): void {
        this.stopped = true;
    }

    getSettings(): MediaTrackSettings {
        return this.settings;
    }

    async applyConstraints(constraints: MediaTrackConstraints): Promise<void> {
        this.applied.push(constraints);
        if (this.applyShouldReject) throw new DOMException("no", "OverconstrainedError");
    }

    addEventListener(type: string, listener: () => void): void {
        const set = this.listeners.get(type) ?? new Set<() => void>();
        set.add(listener);
        this.listeners.set(type, set);
    }

    removeEventListener(type: string, listener: () => void): void {
        this.listeners.get(type)?.delete(listener);
    }

    /** Fire `ended`, as the browser does when the user stops sharing. */
    fireEnded(): void {
        this.listeners.get("ended")?.forEach((listener) => listener());
    }
}

/** Minimal `MediaStream` with real track objects, so release can be asserted. */
export class FakeStream {
    tracks: FakeTrack[];
    id: string;

    constructor(trackCount = 1, id = "stream-1", kind = "audio") {
        this.tracks = Array.from({ length: trackCount }, () => new FakeTrack(kind));
        this.id = id;
    }

    getTracks(): FakeTrack[] {
        return this.tracks;
    }

    getAudioTracks(): FakeTrack[] {
        return this.tracks.filter((track) => track.kind === "audio");
    }

    getVideoTracks(): FakeTrack[] {
        return this.tracks.filter((track) => track.kind === "video");
    }
}

/** Build a `FakeStream` typed as a `MediaStream` for call sites that need the real type. */
export function fakeStream(trackCount = 1, id = "stream-1"): MediaStream {
    return new FakeStream(trackCount, id) as unknown as MediaStream;
}

/**
 * A stream with one video track (plus an audio one when asked), typed as a
 * `MediaStream`.
 *
 * @param options - `audio` adds an audio track; `settings` and `capabilities` are put
 *   on the video track, so a test can say "this camera has a torch" or "the user picked
 *   a browser tab".
 * @returns The stream, and the video track itself for driving `ended` and asserting
 *   `applyConstraints`.
 */
export function fakeVideoStream(
    options: {
        audio?: boolean;
        settings?: MediaTrackSettings;
        capabilities?: TorchAwareCapabilities;
        hasCapabilities?: boolean;
        id?: string;
    } = {},
): { stream: MediaStream; video: FakeTrack } {
    const video = new FakeTrack("video", options.hasCapabilities ?? true);
    if (options.settings) video.settings = options.settings;
    if (options.capabilities) video.capabilities = options.capabilities;
    const stream = new FakeStream(0, options.id ?? "stream-video");
    stream.tracks = options.audio ? [video, new FakeTrack("audio")] : [video];
    return { stream: stream as unknown as MediaStream, video };
}

/** Controllable `MediaRecorder`. Drive it with `emit()` and `fireError()`. */
export class FakeMediaRecorder {
    static supported: string[] = ["audio/webm;codecs=opus", "audio/webm"];
    static instances: FakeMediaRecorder[] = [];
    static isTypeSupported = (type: string): boolean => FakeMediaRecorder.supported.includes(type);

    state: "inactive" | "recording" | "paused" = "inactive";
    mimeType: string;
    stream: MediaStream;
    /** Everything the constructor was handed, so bitrate wiring can be asserted. */
    options: MediaRecorderOptions;
    timeslice: number | undefined;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    constructor(stream: MediaStream, options?: MediaRecorderOptions) {
        this.stream = stream;
        this.options = options ?? {};
        this.mimeType = options?.mimeType ?? "audio/webm";
        FakeMediaRecorder.instances.push(this);
    }

    start(timeslice?: number): void {
        this.state = "recording";
        this.timeslice = timeslice;
    }

    pause(): void {
        this.state = "paused";
    }

    resume(): void {
        this.state = "recording";
    }

    /** Deliver a chunk, exactly as the browser does before `onstop`. */
    emit(bytes = 8): void {
        this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) });
    }

    stop(): void {
        this.state = "inactive";
        this.emit();
        this.onstop?.();
    }

    fireError(error: unknown): void {
        this.onerror?.({ error } as unknown as Event);
    }

    static reset(): void {
        FakeMediaRecorder.instances = [];
        FakeMediaRecorder.supported = ["audio/webm;codecs=opus", "audio/webm"];
    }
}

/** Install {@link FakeMediaRecorder} on `globalThis`. Returns a restore function. */
export function installMediaRecorder(): () => void {
    const previous = (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
    FakeMediaRecorder.reset();
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = FakeMediaRecorder;
    return () => {
        (globalThis as { MediaRecorder?: unknown }).MediaRecorder = previous;
    };
}

/** Remove `MediaRecorder` entirely, to exercise the unsupported path. */
export function removeMediaRecorder(): () => void {
    const previous = (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
    delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
    return () => {
        (globalThis as { MediaRecorder?: unknown }).MediaRecorder = previous;
    };
}

/** `AnalyserNode` that reports a constant sample value, so RMS is predictable. */
class FakeAnalyser {
    fftSize = 1024;
    sample = 0;
    getFloatTimeDomainData(target: Float32Array): void {
        target.fill(this.sample);
    }
    disconnect(): void {}
}

/** An `AudioParam`, which is a value behind a `.value` and nothing else here. */
class FakeParam {
    constructor(public value = 0) {}
}

/** `GainNode` that records what it was connected to, so the graph can be asserted. */
export class FakeGain {
    gain = new FakeParam(1);
    connectedTo: unknown[] = [];
    disconnected = 0;
    connect(target: unknown): void {
        this.connectedTo.push(target);
    }
    disconnect(): void {
        this.disconnected += 1;
    }
}

/** `DynamicsCompressorNode` with the five params a limiter sets. */
export class FakeCompressor {
    threshold = new FakeParam(-24);
    knee = new FakeParam(30);
    ratio = new FakeParam(12);
    attack = new FakeParam(0.003);
    release = new FakeParam(0.25);
    connectedTo: unknown[] = [];
    connect(target: unknown): void {
        this.connectedTo.push(target);
    }
    disconnect(): void {}
}

/** `MediaStreamAudioSourceNode`, which only ever gets connected and disconnected. */
export class FakeSourceNode {
    connectedTo: unknown[] = [];
    disconnected = 0;
    constructor(public stream: unknown) {}
    connect(target: unknown): void {
        this.connectedTo.push(target);
    }
    disconnect(): void {
        this.disconnected += 1;
    }
}

/** `AudioContext` with just the graph the level meter, the WAV encoder and the bus touch. */
export class FakeAudioContext {
    static instances: FakeAudioContext[] = [];
    static decoded: AudioBuffer | null = null;
    static decodeShouldReject = false;
    /** Make `close()` reject, as a context torn down twice does. */
    static closeShouldReject = false;

    closed = false;
    resumed = 0;
    analyser = new FakeAnalyser();
    /** Every gain node handed out, master first. */
    gains: FakeGain[] = [];
    compressors: FakeCompressor[] = [];
    sources: FakeSourceNode[] = [];
    destinations: { stream: MediaStream }[] = [];

    constructor() {
        FakeAudioContext.instances.push(this);
    }

    createMediaStreamSource(stream?: unknown): FakeSourceNode {
        const node = new FakeSourceNode(stream);
        this.sources.push(node);
        return node;
    }

    createGain(): FakeGain {
        const node = new FakeGain();
        this.gains.push(node);
        return node;
    }

    createDynamicsCompressor(): FakeCompressor {
        const node = new FakeCompressor();
        this.compressors.push(node);
        return node;
    }

    createMediaStreamDestination(): { stream: MediaStream } {
        const node = { stream: fakeStream() };
        this.destinations.push(node);
        return node;
    }

    async resume(): Promise<void> {
        this.resumed += 1;
    }

    createAnalyser(): FakeAnalyser {
        return this.analyser;
    }

    async decodeAudioData(): Promise<AudioBuffer> {
        if (FakeAudioContext.decodeShouldReject) throw new Error("cannot decode");
        if (!FakeAudioContext.decoded) throw new Error("no fixture installed");
        return FakeAudioContext.decoded;
    }

    async close(): Promise<void> {
        if (FakeAudioContext.closeShouldReject) throw new Error("already closed");
        this.closed = true;
    }

    static reset(): void {
        FakeAudioContext.instances = [];
        FakeAudioContext.decoded = null;
        FakeAudioContext.decodeShouldReject = false;
        FakeAudioContext.closeShouldReject = false;
    }
}

/** Install {@link FakeAudioContext} on `globalThis`. Returns a restore function. */
export function installAudioContext(): () => void {
    const previous = (globalThis as { AudioContext?: unknown }).AudioContext;
    FakeAudioContext.reset();
    (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
    return () => {
        (globalThis as { AudioContext?: unknown }).AudioContext = previous;
    };
}

/** Remove both Web Audio constructors, to exercise the unsupported path. */
export function removeAudioContext(): () => void {
    const audio = (globalThis as { AudioContext?: unknown }).AudioContext;
    const webkit = (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext;
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
    delete (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext;
    return () => {
        (globalThis as { AudioContext?: unknown }).AudioContext = audio;
        (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext = webkit;
    };
}

/** Build an `AudioBuffer`-shaped fixture from channel data. */
export function fakeAudioBuffer(channels: Float32Array[], sampleRate = 48000): AudioBuffer {
    return {
        numberOfChannels: channels.length,
        length: channels[0]?.length ?? 0,
        sampleRate,
        duration: (channels[0]?.length ?? 0) / sampleRate,
        getChannelData: (index: number) => channels[index],
    } as unknown as AudioBuffer;
}

/**
 * Replace `navigator.mediaDevices` with a controllable stub.
 *
 * `getDisplayMedia` is installed here rather than by a second helper because it lives
 * on the same object: two installers would each snapshot and restore
 * `navigator.mediaDevices`, and whichever restored last would silently undo the other.
 */
export function installMediaDevices(options: {
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
    /** Leave `getDisplayMedia` off the stub entirely, as Safari on iOS does. */
    withoutDisplayMedia?: boolean;
    devices?: MediaDeviceInfo[];
    enumerateShouldReject?: boolean;
}): {
    restore: () => void;
    /** Fire `devicechange`, as plugging in a headset does. */
    fireDeviceChange: () => void;
    setDevices: (next: MediaDeviceInfo[]) => void;
    getUserMedia: ReturnType<typeof vi.fn>;
    getDisplayMedia: ReturnType<typeof vi.fn>;
} {
    const previous = navigator.mediaDevices;
    let devices = options.devices ?? [];
    const listeners = new Set<() => void>();

    const getUserMedia = vi.fn(
        options.getUserMedia ?? ((): Promise<MediaStream> => Promise.resolve(fakeStream())),
    );
    const getDisplayMedia = vi.fn(
        options.getDisplayMedia ??
            ((): Promise<MediaStream> => Promise.resolve(fakeVideoStream().stream)),
    );

    const stub = {
        getUserMedia,
        ...(options.withoutDisplayMedia ? {} : { getDisplayMedia }),
        enumerateDevices: vi.fn(async () => {
            if (options.enumerateShouldReject) throw new Error("nope");
            return devices;
        }),
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };

    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: stub });

    return {
        restore: () =>
            Object.defineProperty(navigator, "mediaDevices", {
                configurable: true,
                value: previous,
            }),
        fireDeviceChange: () => listeners.forEach((listener) => listener()),
        setDevices: (next) => {
            devices = next;
        },
        getUserMedia,
        getDisplayMedia,
    };
}

/** Remove `navigator.mediaDevices` entirely. */
export function removeMediaDevices(): () => void {
    const previous = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    return () =>
        Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: previous });
}

/** Replace `navigator.permissions.query` with a controllable `PermissionStatus`. */
export function installPermissions(initial: PermissionState | "reject"): {
    restore: () => void;
    /** Simulate the user flipping the toggle in site settings. */
    change: (next: PermissionState) => void;
} {
    const previous = navigator.permissions;
    const listeners = new Set<() => void>();
    const status = {
        state: initial === "reject" ? "prompt" : initial,
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };

    Object.defineProperty(navigator, "permissions", {
        configurable: true,
        value: {
            query: vi.fn(async () => {
                if (initial === "reject") throw new Error("unsupported name");
                return status;
            }),
        },
    });

    return {
        restore: () =>
            Object.defineProperty(navigator, "permissions", {
                configurable: true,
                value: previous,
            }),
        change: (next) => {
            status.state = next;
            listeners.forEach((listener) => listener());
        },
    };
}

/** Remove `navigator.permissions`, as Safari effectively does for `microphone`. */
export function removePermissions(): () => void {
    const previous = navigator.permissions;
    Object.defineProperty(navigator, "permissions", { configurable: true, value: undefined });
    return () =>
        Object.defineProperty(navigator, "permissions", { configurable: true, value: previous });
}

/** Build a `MediaDeviceInfo`-shaped fixture. */
export function fakeDevice(
    kind: MediaDeviceKind,
    deviceId: string,
    label = "",
    groupId = "g",
): MediaDeviceInfo {
    return { kind, deviceId, label, groupId, toJSON: () => ({}) } as MediaDeviceInfo;
}

/**
 * Set `window.isSecureContext`.
 *
 * jsdom reports `false`, and the media classifiers treat that as the cause of every
 * capture failure — correctly, because over plain HTTP it is. Any test that wants to
 * reach the `DOMException` mapping, or render a recorder in its working state, has to
 * opt into a secure context first.
 */
export function setSecureContext(value: boolean): () => void {
    const previous = window.isSecureContext;
    Object.defineProperty(window, "isSecureContext", { configurable: true, value });
    return () =>
        Object.defineProperty(window, "isSecureContext", { configurable: true, value: previous });
}

/** What a fake detector resolves with. Shaped like the browser's `DetectedBarcode`. */
export interface FakeBarcode {
    rawValue: string;
    format?: string;
    boundingBox?: DOMRectReadOnly;
    cornerPoints?: Array<{ x: number; y: number }>;
}

/**
 * Controllable `BarcodeDetector`.
 *
 * A class, not `vi.fn(() => …)`: the SDK calls `new BarcodeDetector({ formats })`, and
 * a mock function is not a constructor. What it decodes is a static queue, so a test
 * can hold a code in frame (leave `queue` set) or deliver a single read (`once()`).
 */
export class FakeBarcodeDetector {
    static supportedFormats: string[] = ["qr_code", "ean_13", "code_128"];
    static queue: FakeBarcode[] = [];
    static instances: FakeBarcodeDetector[] = [];
    static constructorShouldThrow = false;
    static detectShouldReject = false;
    static formatsShouldReject = false;
    static calls = 0;

    formats: readonly string[];

    static getSupportedFormats = async (): Promise<string[]> => {
        if (FakeBarcodeDetector.formatsShouldReject) throw new Error("no decoder");
        return FakeBarcodeDetector.supportedFormats;
    };

    constructor(options?: { formats?: readonly string[] }) {
        if (FakeBarcodeDetector.constructorShouldThrow) {
            throw new DOMException("bad format", "NotSupportedError");
        }
        this.formats = options?.formats ?? [];
        FakeBarcodeDetector.instances.push(this);
    }

    async detect(): Promise<FakeBarcode[]> {
        FakeBarcodeDetector.calls += 1;
        if (FakeBarcodeDetector.detectShouldReject) throw new Error("frame not decodable");
        return FakeBarcodeDetector.queue;
    }

    static reset(): void {
        FakeBarcodeDetector.supportedFormats = ["qr_code", "ean_13", "code_128"];
        FakeBarcodeDetector.queue = [];
        FakeBarcodeDetector.instances = [];
        FakeBarcodeDetector.constructorShouldThrow = false;
        FakeBarcodeDetector.detectShouldReject = false;
        FakeBarcodeDetector.formatsShouldReject = false;
        FakeBarcodeDetector.calls = 0;
    }
}

/**
 * Install {@link FakeBarcodeDetector} on `globalThis`.
 *
 * @param options - `withoutProbe` removes the static `getSupportedFormats`, which is
 *   how an older Chromium behaves.
 * @returns A restore function.
 */
export function installBarcodeDetector(options: { withoutProbe?: boolean } = {}): () => void {
    const previous = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
    FakeBarcodeDetector.reset();
    const constructor = FakeBarcodeDetector as unknown as Record<string, unknown>;
    const probe = constructor.getSupportedFormats;
    if (options.withoutProbe) delete constructor.getSupportedFormats;
    (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = FakeBarcodeDetector;
    return () => {
        constructor.getSupportedFormats = probe;
        (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = previous;
    };
}

/** Remove `BarcodeDetector` entirely — Firefox, Safari, Chromium on Linux. */
export function removeBarcodeDetector(): () => void {
    const previous = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
    delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
    return () => {
        (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = previous;
    };
}

/** Put a property descriptor back, or delete the override when there was none. */
function restoreDescriptor(
    target: object,
    property: string,
    descriptor: PropertyDescriptor | undefined,
): void {
    if (descriptor) Object.defineProperty(target, property, descriptor);
    else delete (target as Record<string, unknown>)[property];
}

/**
 * Make a `<video>` behave like one in jsdom.
 *
 * jsdom implements no media pipeline: `play()` throws "Not implemented", `paused` is a
 * hard-coded getter, and `readyState`/`videoWidth`/`videoHeight` are frozen at 0 — so
 * every "is this frame decodable" guard fails and the interesting paths are
 * unreachable. All of them are stubbed together on purpose: stubbing `play()` alone
 * leaves `paused` lying, and a test of the pause path then passes for the wrong reason.
 *
 * @param options - Override the reported frame state; the defaults describe a playing
 *   720p stream.
 * @returns A restore function.
 */
export function installVideoElement(
    options: { readyState?: number; width?: number; height?: number } = {},
): () => void {
    const proto = HTMLMediaElement.prototype as unknown as Record<string, unknown>;
    const previous = {
        play: proto.play,
        pause: proto.pause,
        paused: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "paused"),
        readyState: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "readyState"),
        videoWidth: Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, "videoWidth"),
        videoHeight: Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, "videoHeight"),
    };
    let paused = true;

    proto.play = vi.fn(() => {
        paused = false;
        return Promise.resolve();
    });
    proto.pause = vi.fn(() => {
        paused = true;
    });
    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
        configurable: true,
        get: () => paused,
    });
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
        configurable: true,
        get: () => options.readyState ?? 4,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
        configurable: true,
        get: () => options.width ?? 1280,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
        configurable: true,
        get: () => options.height ?? 720,
    });

    return () => {
        proto.play = previous.play;
        proto.pause = previous.pause;
        restoreDescriptor(HTMLMediaElement.prototype, "paused", previous.paused);
        restoreDescriptor(HTMLMediaElement.prototype, "readyState", previous.readyState);
        restoreDescriptor(HTMLVideoElement.prototype, "videoWidth", previous.videoWidth);
        restoreDescriptor(HTMLVideoElement.prototype, "videoHeight", previous.videoHeight);
    };
}

/**
 * Controllable Web Speech `SpeechRecognition`.
 *
 * Drive a session with `emitResult`, `emitError` and `emitEnd`; the real API only ever
 * reports through those handlers, so a test never has to fake audio.
 */
export class FakeSpeechRecognition {
    static instances: FakeSpeechRecognition[] = [];
    /**
     * What `start()` throws, or `null` to succeed.
     *
     * A value rather than a boolean because the two interesting cases differ: Chromium
     * throws an `InvalidStateError` carrying a message worth showing, and anything that
     * is not an `Error` has to fall back to a written one.
     */
    static startThrows: unknown = null;

    lang = "";
    continuous = false;
    interimResults = false;
    maxAlternatives = 0;
    started = 0;
    stopped = 0;
    aborted = 0;

    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: { error: string; message?: string }) => void) | null = null;
    onend: (() => void) | null = null;
    onstart: (() => void) | null = null;

    constructor() {
        FakeSpeechRecognition.instances.push(this);
    }

    start(): void {
        if (FakeSpeechRecognition.startThrows) throw FakeSpeechRecognition.startThrows;
        this.started += 1;
        this.onstart?.();
    }

    stop(): void {
        this.stopped += 1;
        this.onend?.();
    }

    abort(): void {
        this.aborted += 1;
        this.onend?.();
    }

    /**
     * Deliver a `result` event.
     *
     * @param phrases - One entry per phrase: its text and whether the engine settled on
     *   it.
     * @param resultIndex - Where the new results start, as the browser reports it.
     */
    emitResult(phrases: Array<{ transcript: string; isFinal: boolean }>, resultIndex = 0): void {
        const results: Record<number, unknown> & { length: number } = { length: phrases.length };
        phrases.forEach((phrase, index) => {
            results[index] = {
                isFinal: phrase.isFinal,
                length: 1,
                0: { transcript: phrase.transcript, confidence: 0.9 },
            };
        });
        this.onresult?.({ resultIndex, results });
    }

    emitError(error: string, message?: string): void {
        this.onerror?.({ error, message });
    }

    emitEnd(): void {
        this.onend?.();
    }

    static reset(): void {
        FakeSpeechRecognition.instances = [];
        FakeSpeechRecognition.startThrows = null;
    }
}

/**
 * Install {@link FakeSpeechRecognition} on `globalThis`.
 *
 * @param options - `prefixed` installs it as `webkitSpeechRecognition` only, which is
 *   how Chromium actually exposes it.
 * @returns A restore function.
 */
export function installSpeechRecognition(options: { prefixed?: boolean } = {}): () => void {
    const scope = globalThis as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const previous = { plain: scope.SpeechRecognition, prefixed: scope.webkitSpeechRecognition };
    FakeSpeechRecognition.reset();
    if (options.prefixed) {
        delete scope.SpeechRecognition;
        scope.webkitSpeechRecognition = FakeSpeechRecognition;
    } else {
        scope.SpeechRecognition = FakeSpeechRecognition;
    }
    return () => {
        scope.SpeechRecognition = previous.plain;
        scope.webkitSpeechRecognition = previous.prefixed;
    };
}

/** Remove both `SpeechRecognition` constructors — Firefox, and every non-Chromium engine. */
export function removeSpeechRecognition(): () => void {
    const scope = globalThis as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const previous = { plain: scope.SpeechRecognition, prefixed: scope.webkitSpeechRecognition };
    delete scope.SpeechRecognition;
    delete scope.webkitSpeechRecognition;
    return () => {
        scope.SpeechRecognition = previous.plain;
        scope.webkitSpeechRecognition = previous.prefixed;
    };
}

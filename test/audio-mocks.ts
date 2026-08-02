import { vi } from "vitest";

/**
 * Test doubles for the media APIs jsdom does not implement.
 *
 * All of them are **classes**, not `vi.fn(() => obj)`: the code under test uses `new
 * MediaRecorder(...)` and `new AudioContext()`, and a plain mock function is not a
 * constructor — it throws before any assertion runs.
 */

/** A `MediaStreamTrack` that records whether it was stopped. */
export class FakeTrack {
    stopped = false;
    kind = "audio";
    stop(): void {
        this.stopped = true;
    }
}

/** Minimal `MediaStream` with real track objects, so release can be asserted. */
export class FakeStream {
    tracks: FakeTrack[];
    id: string;

    constructor(trackCount = 1, id = "stream-1") {
        this.tracks = Array.from({ length: trackCount }, () => new FakeTrack());
        this.id = id;
    }

    getTracks(): FakeTrack[] {
        return this.tracks;
    }

    getAudioTracks(): FakeTrack[] {
        return this.tracks;
    }
}

/** Build a `FakeStream` typed as a `MediaStream` for call sites that need the real type. */
export function fakeStream(trackCount = 1, id = "stream-1"): MediaStream {
    return new FakeStream(trackCount, id) as unknown as MediaStream;
}

/** Controllable `MediaRecorder`. Drive it with `emit()` and `fireError()`. */
export class FakeMediaRecorder {
    static supported: string[] = ["audio/webm;codecs=opus", "audio/webm"];
    static instances: FakeMediaRecorder[] = [];
    static isTypeSupported = (type: string): boolean => FakeMediaRecorder.supported.includes(type);

    state: "inactive" | "recording" | "paused" = "inactive";
    mimeType: string;
    stream: MediaStream;
    timeslice: number | undefined;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    constructor(stream: MediaStream, options?: { mimeType?: string }) {
        this.stream = stream;
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

/** `AudioContext` with just the graph the level meter and the WAV encoder touch. */
export class FakeAudioContext {
    static instances: FakeAudioContext[] = [];
    static decoded: AudioBuffer | null = null;
    static decodeShouldReject = false;

    closed = false;
    analyser = new FakeAnalyser();

    constructor() {
        FakeAudioContext.instances.push(this);
    }

    createMediaStreamSource(): { connect: () => void; disconnect: () => void } {
        return { connect: () => undefined, disconnect: () => undefined };
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
        this.closed = true;
    }

    static reset(): void {
        FakeAudioContext.instances = [];
        FakeAudioContext.decoded = null;
        FakeAudioContext.decodeShouldReject = false;
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

/** Replace `navigator.mediaDevices` with a controllable stub. */
export function installMediaDevices(options: {
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    devices?: MediaDeviceInfo[];
    enumerateShouldReject?: boolean;
}): {
    restore: () => void;
    /** Fire `devicechange`, as plugging in a headset does. */
    fireDeviceChange: () => void;
    setDevices: (next: MediaDeviceInfo[]) => void;
    getUserMedia: ReturnType<typeof vi.fn>;
} {
    const previous = navigator.mediaDevices;
    let devices = options.devices ?? [];
    const listeners = new Set<() => void>();

    const getUserMedia = vi.fn(
        options.getUserMedia ?? ((): Promise<MediaStream> => Promise.resolve(fakeStream())),
    );

    const stub = {
        getUserMedia,
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

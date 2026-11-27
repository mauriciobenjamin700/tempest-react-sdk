import { readDeviceProfile } from "@/perf/device";

/**
 * What this device offers for on-device speech recognition.
 */

/** Why a device was ruled out before trying. */
export type SpeechDeviceBlocker = "no-webassembly" | "no-wasm-simd" | "low-memory";

/** Result of {@link assessSpeechDevice}. */
export interface SpeechDeviceAssessment {
    /** `false` when a blocker makes local transcription pointless to attempt. */
    canRun: boolean;
    blockers: readonly SpeechDeviceBlocker[];
    wasmSimd: boolean;
    /** `crossOriginIsolated` with `SharedArrayBuffer`: ONNX Runtime can use several threads. */
    wasmThreads: boolean;
    /** `navigator.gpu` exists (an adapter may still be refused). */
    webgpu: boolean;
    /** Coarse RAM in GiB (Chromium only), or `null`. */
    deviceMemoryGb: number | null;
    hardwareConcurrency: number | null;
}

/** Options for {@link assessSpeechDevice}. */
export interface AssessSpeechDeviceOptions {
    /**
     * Below this `navigator.deviceMemory` the device is ruled out. Default `2`
     * GiB. Only a coarse filter: a device that passes can still be too slow,
     * and that is decided by the deadline in `createSpeechToText`, from a real
     * run, not from a spec sheet.
     */
    minMemoryGb?: number;
}

/**
 * Smallest module using a SIMD instruction (`i8x16.popcnt`), the probe the
 * `wasm-feature-detect` project uses. ONNX Runtime Web ships only SIMD
 * builds, so without it nothing below can run.
 */
const SIMD_PROBE = new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253,
    15, 253, 98, 11,
]);

/**
 * Check, without loading anything, whether this device can run Whisper.
 *
 * Cheap and synchronous, so an app can decide before offering the button
 * whether a recording will be transcribed here or sent to the server.
 *
 * @param options Thresholds.
 * @returns The assessment.
 *
 * @example
 * ```typescript
 * import { assessSpeechDevice } from "tempest-react-sdk/speech";
 *
 * const device = assessSpeechDevice();
 * if (!device.canRun) console.log("transcribe on the server:", device.blockers);
 * ```
 */
export function assessSpeechDevice(
    options: AssessSpeechDeviceOptions = {},
): SpeechDeviceAssessment {
    const { minMemoryGb = 2 } = options;
    const hasWasm = typeof WebAssembly !== "undefined";
    let wasmSimd = false;
    if (hasWasm) {
        try {
            wasmSimd = WebAssembly.validate(SIMD_PROBE);
        } catch {
            wasmSimd = false;
        }
    }
    const scope = globalThis as { crossOriginIsolated?: boolean; navigator?: { gpu?: unknown } };
    const profile = readDeviceProfile();
    const blockers: SpeechDeviceBlocker[] = [];
    if (!hasWasm) blockers.push("no-webassembly");
    else if (!wasmSimd) blockers.push("no-wasm-simd");
    if (profile.deviceMemoryGb !== null && profile.deviceMemoryGb < minMemoryGb)
        blockers.push("low-memory");
    return {
        canRun: blockers.length === 0,
        blockers,
        wasmSimd,
        wasmThreads: scope.crossOriginIsolated === true && typeof SharedArrayBuffer !== "undefined",
        webgpu: scope.navigator?.gpu !== undefined,
        deviceMemoryGb: profile.deviceMemoryGb,
        hardwareConcurrency: profile.hardwareConcurrency,
    };
}

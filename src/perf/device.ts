import type { DeviceProfile } from "./types";

/**
 * What the browser will tell us about the machine it is running on.
 */

const BYTES_PER_MIB = 1024 * 1024;

/** `navigator.deviceMemory` is Chromium-only and absent from the DOM lib. */
interface DeviceMemoryNavigator extends Navigator {
    deviceMemory?: number;
}

/** `performance.memory` is a non-standard Chromium extension. */
interface HeapPerformance extends Performance {
    memory?: { usedJSHeapSize: number };
}

/**
 * Used JS heap in MiB, rounded to one decimal.
 *
 * @returns The heap usage, or `null` outside Chromium.
 */
function readHeapUsedMb(): number | null {
    if (typeof performance === "undefined") return null;
    const memory = (performance as HeapPerformance).memory;
    if (!memory) return null;
    return Math.round((memory.usedJSHeapSize / BYTES_PER_MIB) * 10) / 10;
}

/**
 * Sample the device capabilities the browser reports.
 *
 * Safe to call during SSR: without a `navigator` every field is `null`.
 *
 * @returns The profile, with `null` for anything this platform withholds.
 *
 * @example
 * ```typescript
 * const device = readDeviceProfile();
 * console.log(device.hardwareConcurrency); // 8
 * console.log(device.deviceMemoryGb);      // 8 on Chromium, null on Safari
 * ```
 */
export function readDeviceProfile(): DeviceProfile {
    if (typeof navigator === "undefined") {
        return { hardwareConcurrency: null, deviceMemoryGb: null, jsHeapUsedMb: null };
    }
    const nav = navigator as DeviceMemoryNavigator;
    return {
        hardwareConcurrency: nav.hardwareConcurrency ?? null,
        deviceMemoryGb: nav.deviceMemory ?? null,
        jsHeapUsedMb: readHeapUsedMb(),
    };
}

import type { BatteryStatus } from "./monitor-types";

/**
 * Battery level and discharge rate from the Battery Status API.
 */

const MS_PER_HOUR = 3_600_000;

/** `BatteryManager`, the subset read here; absent from the DOM lib. */
interface BatteryManagerLike extends EventTarget {
    level: number;
    charging: boolean;
}

/** `navigator.getBattery` is Chromium-only. */
interface BatteryNavigator extends Navigator {
    getBattery?: () => Promise<BatteryManagerLike>;
}

/** A level change seen while unplugged. */
interface DischargeEdge {
    level: number;
    at: number;
}

/** Tracks battery level and how fast it falls. */
export interface BatteryRecorder {
    /** Whether `navigator.getBattery` exists here. */
    readonly supported: boolean;
    /** Current status, or `null` before the first reading or when unsupported. */
    status(): BatteryStatus | null;
    stop(): void;
}

/**
 * Discharge rate between the first and last level change of a run on battery.
 *
 * Measuring edge to edge is what makes the 1 % rounding harmless: the level
 * crossed exactly `first - last` steps in that span. Measuring from an
 * arbitrary moment instead would charge an unknown fraction of a step to the
 * window and, over a short session, could be off by 100 %.
 *
 * @param edges Level changes since the device was last unplugged.
 * @returns Percentage points per hour, or `null` with fewer than two edges.
 */
export function drainPerHour(edges: readonly DischargeEdge[]): number | null {
    if (edges.length < 2) return null;
    const first = edges[0] as DischargeEdge;
    const last = edges[edges.length - 1] as DischargeEdge;
    const hours = (last.at - first.at) / MS_PER_HOUR;
    const drop = (first.level - last.level) * 100;
    if (hours <= 0 || drop <= 0) return null;
    return drop / hours;
}

/**
 * Start following the battery.
 *
 * The browser exposes the level in 1 % steps and no energy counter, so the
 * cost of a single interaction is far below what this API can resolve. What it
 * can measure is the session's drain rate — compare it between builds or
 * between a session with the heavy feature on and off. For joules per
 * interaction, profile on the device itself (Perfetto on Android).
 *
 * @param onChange Called after every level or charging change.
 * @returns The recorder.
 */
export function createBatteryRecorder(onChange: () => void): BatteryRecorder {
    const nav = typeof navigator === "undefined" ? undefined : (navigator as BatteryNavigator);
    const supported = typeof nav?.getBattery === "function";
    let manager: BatteryManagerLike | null = null;
    let edges: DischargeEdge[] = [];
    let current: BatteryStatus | null = null;
    let stopped = false;

    const read = (): void => {
        if (!manager) return;
        current = {
            level: manager.level,
            charging: manager.charging,
            at: performance.now(),
            drainPerHour: manager.charging ? null : drainPerHour(edges),
        };
        onChange();
    };
    const onLevel = (): void => {
        if (manager && !manager.charging) {
            edges.push({ level: manager.level, at: performance.now() });
        }
        read();
    };
    const onCharging = (): void => {
        edges = [];
        read();
    };

    if (supported) {
        nav?.getBattery?.()
            .then((battery) => {
                if (stopped) return;
                manager = battery;
                battery.addEventListener("levelchange", onLevel);
                battery.addEventListener("chargingchange", onCharging);
                read();
            })
            .catch(() => undefined);
    }

    return {
        supported,
        status(): BatteryStatus | null {
            return current;
        },
        stop(): void {
            stopped = true;
            manager?.removeEventListener("levelchange", onLevel);
            manager?.removeEventListener("chargingchange", onCharging);
            manager = null;
        },
    };
}

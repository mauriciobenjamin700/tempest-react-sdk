import { useSyncExternalStore } from "react";
import type { PerfMonitor, PerfSnapshot } from "./monitor-types";

/**
 * Subscribe a component to a {@link PerfMonitor}.
 *
 * The monitor is created by the app (once, at start) and passed in, not
 * created here: a hook-owned monitor would start observing on mount and miss
 * everything before it, and two components would get two monitors.
 *
 * @param monitor The app's monitor.
 * @returns The live snapshot; the component re-renders on every change.
 *
 * @example
 * ```tsx
 * import { PerfHud, createPerfMonitor, usePerfMonitor } from "tempest-react-sdk";
 *
 * const perf = createPerfMonitor();
 *
 * export function DevOverlay() {
 *     const snapshot = usePerfMonitor(perf);
 *     return <PerfHud snapshot={snapshot} />;
 * }
 * ```
 */
export function usePerfMonitor(monitor: PerfMonitor): PerfSnapshot {
    return useSyncExternalStore(monitor.subscribe, monitor.getSnapshot, monitor.getSnapshot);
}

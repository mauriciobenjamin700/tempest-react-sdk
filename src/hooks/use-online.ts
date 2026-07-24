import { useEffect, useRef, useState } from "react";

/**
 * Options for {@link useOnline}. Omit them for the cheap `navigator.onLine`
 * behaviour; pass `pingUrl` to add a real-reachability probe on top.
 */
export interface UseOnlineOptions {
    /**
     * URL to probe for real connectivity. `navigator.onLine` reports `true`
     * behind a captive portal or when the machine has a link but no internet;
     * a periodic `HEAD` to this URL catches those cases. When set, the result
     * is `navigator.onLine && lastProbeSucceeded`.
     */
    pingUrl?: string;
    /** How often to probe, in ms. Default `30000`. */
    intervalMs?: number;
    /** Abort a probe after this many ms and treat it as offline. Default `5000`. */
    timeoutMs?: number;
}

/**
 * Track connectivity and re-render on changes.
 *
 * With no options it mirrors `navigator.onLine` (assuming online during SSR and
 * before the first event). Pass `pingUrl` to additionally probe real
 * reachability — the browser's `onLine` flag lies behind captive portals and
 * dead links, so the probe downgrades the result to `false` when the network is
 * unusable even though `navigator.onLine` is `true`.
 *
 * @param options - Optional reachability-probe configuration.
 * @returns `true` when the device is online (and reachable, when probing).
 *
 * @example
 * const online = useOnline(); // navigator.onLine only
 * const reallyOnline = useOnline({ pingUrl: "/health", intervalMs: 15_000 });
 */
export function useOnline(options: UseOnlineOptions = {}): boolean {
    const { pingUrl, intervalMs = 30_000, timeoutMs = 5_000 } = options;

    const [navOnline, setNavOnline] = useState<boolean>(() =>
        typeof navigator === "undefined" ? true : navigator.onLine,
    );
    const [reachable, setReachable] = useState<boolean>(true);

    const optionsRef = useRef({ pingUrl, timeoutMs });
    optionsRef.current = { pingUrl, timeoutMs };

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleOnline = (): void => setNavOnline(true);
        const handleOffline = (): void => setNavOnline(false);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    useEffect(() => {
        if (!pingUrl || typeof window === "undefined") return;

        let cancelled = false;
        const probe = async (): Promise<void> => {
            if (typeof navigator !== "undefined" && !navigator.onLine) {
                if (!cancelled) setReachable(false);
                return;
            }
            const controller = new AbortController();
            const timer = window.setTimeout(() => controller.abort(), optionsRef.current.timeoutMs);
            try {
                await fetch(optionsRef.current.pingUrl!, {
                    method: "HEAD",
                    cache: "no-store",
                    signal: controller.signal,
                });
                if (!cancelled) setReachable(true);
            } catch {
                if (!cancelled) setReachable(false);
            } finally {
                window.clearTimeout(timer);
            }
        };

        void probe();
        const id = window.setInterval(() => void probe(), intervalMs);
        const onWake = (): void => void probe();
        window.addEventListener("online", onWake);
        document.addEventListener("visibilitychange", onWake);
        return () => {
            cancelled = true;
            window.clearInterval(id);
            window.removeEventListener("online", onWake);
            document.removeEventListener("visibilitychange", onWake);
        };
    }, [pingUrl, intervalMs]);

    return pingUrl ? navOnline && reachable : navOnline;
}

import { useEffect, useState } from "react";

const DEFAULT_EVENTS: (keyof WindowEventMap)[] = [
    "mousemove",
    "mousedown",
    "keydown",
    "touchstart",
    "wheel",
    "scroll",
];

/**
 * Detect when the user has been idle for `timeout` ms (no interaction).
 * Returns `true` once the threshold elapses and back to `false` on activity.
 */
export function useIdle(timeout = 60_000): boolean {
    const [idle, setIdle] = useState<boolean>(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        let timer = setTimeout(() => setIdle(true), timeout);

        function reset(): void {
            setIdle(false);
            clearTimeout(timer);
            timer = setTimeout(() => setIdle(true), timeout);
        }

        for (const event of DEFAULT_EVENTS) {
            window.addEventListener(event, reset, { passive: true });
        }
        return () => {
            clearTimeout(timer);
            for (const event of DEFAULT_EVENTS) {
                window.removeEventListener(event, reset);
            }
        };
    }, [timeout]);

    return idle;
}

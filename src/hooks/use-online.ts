import { useEffect, useState } from "react";

/**
 * Track the browser's `navigator.onLine` value and re-render on changes.
 * Returns `true` during SSR (assumption: server is online).
 */
export function useOnline(): boolean {
    const [online, setOnline] = useState<boolean>(() =>
        typeof navigator === "undefined" ? true : navigator.onLine,
    );

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleOnline = (): void => setOnline(true);
        const handleOffline = (): void => setOnline(false);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    return online;
}

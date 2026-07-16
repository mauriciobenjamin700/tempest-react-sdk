import { useEffect } from "react";
import type { ReactNode } from "react";
import {
    OfflineIndicator,
    UpdatePrompt,
    registerPeriodicSync,
    requestPersistentStorage,
    useServiceWorkerUpdate,
} from "tempest-react-sdk";

/**
 * PWA shell: registers the service worker, wires the consent-based update
 * prompt and the offline indicator, requests persistent storage (so the
 * offline cache/IndexedDB is not evicted) and registers a periodic background
 * sync once the worker is ready.
 *
 * Wraps the app so the fixed-position overlays render as siblings of the tree.
 * The SDK helpers no-op gracefully where a capability is unsupported.
 */
export function PwaShell({ children }: { children: ReactNode }) {
    const { updateAvailable, applyUpdate, registration } = useServiceWorkerUpdate({
        url: "/sw.js",
        onError: (err) => console.warn("[sw] registration failed", err),
    });

    useEffect(() => {
        void requestPersistentStorage();
    }, []);

    useEffect(() => {
        if (!registration) return;
        void registerPeriodicSync({ registration, minIntervalMinutes: 360 });
    }, [registration]);

    return (
        <>
            {children}
            <OfflineIndicator position="bottom" />
            <UpdatePrompt open={updateAvailable} onUpdate={applyUpdate} />
        </>
    );
}

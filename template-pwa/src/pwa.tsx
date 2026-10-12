import { useEffect } from "react";
import type { ReactNode } from "react";
import {
    OfflineIndicator,
    UpdatePrompt,
    provideBackgroundSyncCredentials,
    registerPeriodicSync,
    requestPersistentStorage,
    useServiceWorkerUpdate,
} from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";

/**
 * PWA shell: registers the service worker, wires the consent-based update
 * prompt and the offline indicator, requests persistent storage (so the
 * offline cache/IndexedDB is not evicted) and registers a periodic background
 * sync once the worker is ready.
 *
 * It also answers the worker's background-sync questions from the auth store.
 * The queue never stores the bearer, so a mutation that failed offline is only
 * replayed with the token read here at replay time, and only while the same
 * user (`getPrincipal`) is signed in — another account's tab, or a signed-out
 * one, gets it dropped. Without this provider, queued authenticated mutations
 * would wait unsent until they expire. A project without accounts deletes this
 * effect along with `@/stores/auth`.
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

    useEffect(
        () =>
            provideBackgroundSyncCredentials(
                () => {
                    const { token } = useAuth.getState();
                    return token ? { Authorization: `Bearer ${token}` } : null;
                },
                { getPrincipal: () => useAuth.getState().user?.id },
            ),
        [],
    );

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

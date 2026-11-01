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
import { clearSessionData } from "tempest-react-sdk/sw";
import { useAuth } from "@/stores/auth";

/**
 * Remove what this device keeps for the account that just signed out: the
 * service worker's runtime caches and background-sync queue
 * (`clearSessionData()`, which keeps the app-shell precache), and the browser's
 * push subscription, so the next person on this device does not receive the
 * previous account's notifications.
 *
 * The push subscription is released in the browser only: the backend delete
 * needs the token that logout just dropped. The push service answers the
 * backend's next send to the dead endpoint with `404`/`410`, which is when the
 * backend prunes it. Every step is best-effort — logout must not fail because
 * the worker is missing (as under `npm run dev`) or push is unsupported.
 */
async function forgetSignedOutAccount(): Promise<void> {
    await Promise.allSettled([
        clearSessionData(),
        (async () => {
            const registration = await navigator.serviceWorker?.getRegistration();
            const subscription = await registration?.pushManager?.getSubscription();
            await subscription?.unsubscribe();
        })(),
    ]);
}

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
 * And it ends the device session whenever the signed-in account goes away —
 * the Logout button, a `401` reaching `onUnauthorized`, or a different account
 * signing in over it — by watching the auth store instead of each logout path
 * (see `forgetSignedOutAccount`). A token refresh keeps the same user, so it
 * clears nothing.
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

    useEffect(
        () =>
            useAuth.subscribe((state, previous) => {
                const ended =
                    previous.isAuthenticated &&
                    (!state.isAuthenticated || state.user?.id !== previous.user?.id);
                if (ended) void forgetSignedOutAccount();
            }),
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

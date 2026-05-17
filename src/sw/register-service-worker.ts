export interface RegisterServiceWorkerOptions {
    /** Public URL of the compiled service worker file (e.g. `/sw.js`). */
    url: string;
    /** SW scope (default: SW directory). */
    scope?: string;
    /** Called once the registration is active. */
    onReady?: (registration: ServiceWorkerRegistration) => void;
    /**
     * Called when a new worker has finished installing while another worker
     * still controls the page. The host app typically prompts the user to
     * reload and then calls {@link skipWaiting} on the returned worker.
     */
    onUpdate?: (waiting: ServiceWorker, registration: ServiceWorkerRegistration) => void;
    /** Called on registration failure. */
    onError?: (error: unknown) => void;
}

/**
 * Register a service worker with consistent update-detection wiring.
 *
 * Skips silently when the runtime has no `serviceWorker` support. The host
 * app keeps full control over the SW file — this helper only handles the
 * boilerplate around `register()` and `updatefound`.
 *
 * @returns The registration when it succeeds, or `null` when unsupported.
 */
export async function registerServiceWorker(
    options: RegisterServiceWorkerOptions,
): Promise<ServiceWorkerRegistration | null> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.register(options.url, {
            scope: options.scope,
        });

        if (registration.active) options.onReady?.(registration);

        registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
                if (installing.state === "installed" && navigator.serviceWorker.controller) {
                    options.onUpdate?.(installing, registration);
                }
            });
        });

        return registration;
    } catch (error) {
        options.onError?.(error);
        return null;
    }
}

/**
 * Tell a waiting worker to activate immediately. Pair with `onUpdate` to roll
 * out updates after the user confirms a reload prompt.
 */
export function skipWaiting(worker: ServiceWorker): void {
    worker.postMessage({ type: "SKIP_WAITING" });
}

/**
 * Unregister all registered service workers for this origin.
 *
 * @returns Number of workers that were unregistered.
 */
export async function unregisterAllServiceWorkers(): Promise<number> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return 0;
    const registrations = await navigator.serviceWorker.getRegistrations();
    let count = 0;
    for (const registration of registrations) {
        const result = await registration.unregister();
        if (result) count += 1;
    }
    return count;
}

/**
 * Main-thread helper to register a Periodic Background Sync, the counterpart to
 * the `periodicsync` listener installed by `installBackgroundSync`. Chrome-only
 * and gated behind the `periodic-background-sync` permission plus a site
 * engagement heuristic; degrades to a no-op (returns `false`) everywhere else.
 */

interface PeriodicSyncManagerLike {
    register(tag: string, options?: { minInterval: number }): Promise<void>;
    unregister(tag: string): Promise<void>;
}

/** Options for {@link registerPeriodicSync}. */
export interface RegisterPeriodicSyncOptions {
    /** The active service-worker registration. */
    registration: ServiceWorkerRegistration;
    /** Sync tag; must match `installBackgroundSync`'s `periodicSyncTag`. Default `tempest-bg-sync-periodic`. */
    tag?: string;
    /**
     * Minimum interval between runs, in minutes. The browser treats this as a
     * floor and may space runs out much further. Default `720` (12h).
     */
    minIntervalMinutes?: number;
}

/**
 * Request a Periodic Background Sync registration.
 *
 * Checks the `periodic-background-sync` permission first and only registers
 * when it is granted, so calling this unconditionally is safe. The browser
 * ultimately decides whether and how often the `periodicsync` event fires.
 *
 * @param options - The registration, tag and interval.
 * @returns `true` when the periodic sync was registered, else `false`
 *   (unsupported, permission denied, or registration threw).
 *
 * @example
 * const reg = await navigator.serviceWorker.ready;
 * await registerPeriodicSync({ registration: reg, minIntervalMinutes: 360 });
 */
export async function registerPeriodicSync(options: RegisterPeriodicSyncOptions): Promise<boolean> {
    const manager = (options.registration as unknown as { periodicSync?: PeriodicSyncManagerLike })
        .periodicSync;
    if (!manager) return false;

    try {
        if (typeof navigator !== "undefined" && navigator.permissions?.query) {
            const status = await navigator.permissions.query({
                name: "periodic-background-sync" as PermissionName,
            });
            if (status.state !== "granted") return false;
        }
        const minInterval = (options.minIntervalMinutes ?? 720) * 60 * 1000;
        await manager.register(options.tag ?? "tempest-bg-sync-periodic", { minInterval });
        return true;
    } catch {
        return false;
    }
}

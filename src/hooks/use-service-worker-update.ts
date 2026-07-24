import { useCallback, useEffect, useRef, useState } from "react";
import {
    registerServiceWorker,
    skipWaiting,
    type RegisterServiceWorkerOptions,
} from "../sw/register-service-worker";

/**
 * Options for {@link useServiceWorkerUpdate}. Mirrors the registration options
 * minus the callbacks the hook owns internally (`onUpdate`); `onReady` and
 * `onError` still pass through for host-side logging.
 *
 * Leave `autoUpdate` off (the default): this hook exists to hand the reload
 * decision to the user, so a silent auto-reload would defeat the prompt.
 */
export type UseServiceWorkerUpdateOptions = Omit<RegisterServiceWorkerOptions, "onUpdate">;

/** Reactive service-worker update state plus the apply action. */
export interface UseServiceWorkerUpdateResult {
    /** `true` once a new worker has installed and is waiting to activate. */
    updateAvailable: boolean;
    /**
     * Activate the waiting worker and reload the page once it takes control.
     * No-op when no update is waiting.
     */
    applyUpdate: () => void;
    /** The active registration, or `null` before it resolves / when unsupported. */
    registration: ServiceWorkerRegistration | null;
}

/**
 * Register a service worker and expose a user-driven update flow.
 *
 * Wraps {@link registerServiceWorker}: when a fresh worker finishes installing
 * while the page is still controlled by the old one, `updateAvailable` flips to
 * `true`. Call `applyUpdate` — typically from an "atualizar" toast — to tell the
 * waiting worker to activate and reload the page once it takes control.
 *
 * Skips cleanly when the runtime has no service-worker support (`registration`
 * stays `null`, `updateAvailable` stays `false`).
 *
 * @param options - Registration options (`url` required); `autoUpdate` should
 *   stay off so the reload is user-confirmed.
 * @returns The update state and `applyUpdate` action.
 *
 * @example
 * const { updateAvailable, applyUpdate } = useServiceWorkerUpdate({ url: "/sw.js" });
 * return (
 *     <UpdatePrompt open={updateAvailable} onUpdate={applyUpdate} />
 * );
 */
export function useServiceWorkerUpdate(
    options: UseServiceWorkerUpdateOptions,
): UseServiceWorkerUpdateResult {
    const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
    const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
    const waitingRef = useRef<ServiceWorker | null>(null);

    const optionsRef = useRef(options);
    optionsRef.current = options;

    useEffect(() => {
        let cancelled = false;
        void registerServiceWorker({
            ...optionsRef.current,
            onUpdate: (waiting, reg) => {
                waitingRef.current = waiting;
                setRegistration(reg);
                setUpdateAvailable(true);
            },
            onReady: (reg) => {
                if (cancelled) return;
                setRegistration(reg);
                if (reg.waiting && navigator.serviceWorker.controller) {
                    waitingRef.current = reg.waiting;
                    setUpdateAvailable(true);
                }
                optionsRef.current.onReady?.(reg);
            },
        }).then((reg) => {
            if (!cancelled && reg) setRegistration(reg);
        });
        return () => {
            cancelled = true;
        };
    }, [options.url]);

    const applyUpdate = useCallback(() => {
        const waiting = waitingRef.current;
        if (!waiting || typeof navigator === "undefined") return;
        let reloading = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (reloading) return;
            reloading = true;
            window.location.reload();
        });
        skipWaiting(waiting);
    }, []);

    return { updateAvailable, applyUpdate, registration };
}

import { useEffect, useState } from "react";
import {
    buildOpenInChromeIntent,
    isAndroidWithoutPromptApi,
    isIOS,
    isStandalone,
    type BeforeInstallPromptEvent,
} from "./pwa-env";

const DEFAULT_DECLINE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MANUAL_FALLBACK_DELAY_MS = 3000;
const DEFAULT_DECLINE_STORAGE_KEY = "tempest:install-declined-at";

let cachedEvent: BeforeInstallPromptEvent | null = null;
const eventSubscribers = new Set<(event: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (event: Event) => {
        event.preventDefault();
        cachedEvent = event as BeforeInstallPromptEvent;
        eventSubscribers.forEach((fn) => fn(cachedEvent));
    });
    window.addEventListener("appinstalled", () => {
        cachedEvent = null;
        eventSubscribers.forEach((fn) => fn(null));
    });
}

/**
 * Strategy the UI should use to install the app:
 *
 * - `"native"`: trigger `BeforeInstallPromptEvent.prompt()`.
 * - `"ios"`: show iOS Safari Share → Add to Home Screen instructions.
 * - `"manual"`: show generic browser-menu instructions (Chromium forks that
 *   strip the prompt API, plus the timeout fallback when no event arrives).
 * - `"none"`: nothing to offer (already installed or unsupported runtime).
 */
export type InstallMethod = "native" | "ios" | "manual" | "none";

/** Options for {@link useInstallPrompt}. */
export interface UseInstallPromptOptions {
    /**
     * `localStorage` key used to persist the decline timestamp. Defaults to
     * `"tempest:install-declined-at"`.
     */
    declineStorageKey?: string;
    /**
     * How long, in ms, the install CTA stays hidden after the user declines.
     * Defaults to 7 days.
     */
    declineCooldownMs?: number;
    /**
     * How long, in ms, to wait for a `beforeinstallprompt` event before
     * resolving to the `"manual"` method. Defaults to `3000`.
     */
    manualFallbackDelayMs?: number;
}

/** State returned by {@link useInstallPrompt}. */
export interface UseInstallPromptResult {
    /** The cached `beforeinstallprompt` event, or `null` when unavailable. */
    deferredPrompt: BeforeInstallPromptEvent | null;
    /** True when the app can be installed through any supported method. */
    canInstall: boolean;
    /** True when running on iOS/iPadOS Safari. */
    isIOS: boolean;
    /** True when already running as an installed PWA. */
    isStandalone: boolean;
    /** True when the browser is an Android Chromium fork with no prompt API. */
    isManualAndroid: boolean;
    /** True when no `beforeinstallprompt` arrived within the timeout window. */
    promptTimedOut: boolean;
    /** The resolved install strategy the UI should follow. */
    method: InstallMethod;
    /** An `intent://` URL to re-open the page in Chrome on Android, else `null`. */
    openInChromeIntent: string | null;
    /**
     * Triggers the native prompt.
     *
     * @returns `true` when the user accepted the install, `false` otherwise.
     */
    install: () => Promise<boolean>;
    /** Records that the user declined the CTA, starting the cooldown window. */
    recordDecline: () => void;
}

function readDecline(key: string, cooldownMs: number): boolean {
    if (typeof window === "undefined") return false;
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < cooldownMs;
}

/**
 * React hook that resolves how (and whether) to offer PWA installation.
 *
 * It caches the `beforeinstallprompt` event, detects iOS/iPadOS, detects
 * Android Chromium forks that lack the prompt API, detects standalone display
 * mode, and applies a decline cooldown persisted in `localStorage`. The
 * resulting `method` tells the UI which install affordance to render.
 *
 * The decline persistence is pluggable through
 * {@link UseInstallPromptOptions.declineStorageKey} and
 * {@link UseInstallPromptOptions.declineCooldownMs} — no app-specific storage
 * layer is required, and it is SSR-guarded.
 *
 * @param options - Optional storage key, cooldown, and fallback-delay tuning.
 * @returns The install state plus `install()` and `recordDecline()` actions.
 *
 * @example
 * const { method, install } = useInstallPrompt();
 * if (method === "native") return <button onClick={install}>Install</button>;
 */
export function useInstallPrompt(options: UseInstallPromptOptions = {}): UseInstallPromptResult {
    const {
        declineStorageKey = DEFAULT_DECLINE_STORAGE_KEY,
        declineCooldownMs = DEFAULT_DECLINE_COOLDOWN_MS,
        manualFallbackDelayMs = DEFAULT_MANUAL_FALLBACK_DELAY_MS,
    } = options;

    const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(cachedEvent);
    const [standalone, setStandalone] = useState<boolean>(isStandalone());
    const [promptTimedOut, setPromptTimedOut] = useState<boolean>(false);

    useEffect(() => {
        eventSubscribers.add(setEvent);
        return () => {
            eventSubscribers.delete(setEvent);
        };
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia?.("(display-mode: standalone)");
        const handler = (): void => setStandalone(isStandalone());
        mq?.addEventListener?.("change", handler);
        window.addEventListener("appinstalled", handler);
        return () => {
            mq?.removeEventListener?.("change", handler);
            window.removeEventListener("appinstalled", handler);
        };
    }, []);

    useEffect(() => {
        if (event) {
            setPromptTimedOut(false);
            return;
        }
        const timer = window.setTimeout(() => {
            if (!cachedEvent) setPromptTimedOut(true);
        }, manualFallbackDelayMs);
        return () => window.clearTimeout(timer);
    }, [event, manualFallbackDelayMs]);

    const ios = isIOS();
    const manualAndroid = isAndroidWithoutPromptApi();

    const declineActive = readDecline(declineStorageKey, declineCooldownMs);

    let method: InstallMethod = "none";
    if (!standalone && !declineActive) {
        if (event) method = "native";
        else if (ios) method = "ios";
        else if (manualAndroid || promptTimedOut) method = "manual";
    }

    const recordDecline = (): void => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(declineStorageKey, String(Date.now()));
    };

    const install = async (): Promise<boolean> => {
        if (!event) return false;
        await event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome === "dismissed") recordDecline();
        cachedEvent = null;
        eventSubscribers.forEach((fn) => fn(null));
        return choice.outcome === "accepted";
    };

    return {
        deferredPrompt: event,
        canInstall: method !== "none",
        isIOS: ios,
        isStandalone: standalone,
        isManualAndroid: manualAndroid,
        promptTimedOut,
        method,
        openInChromeIntent: buildOpenInChromeIntent(),
        install,
        recordDecline,
    };
}

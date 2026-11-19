import { useEffect, useState } from "react";
import {
    buildOpenInChromeIntent,
    isAndroidWithoutPromptApi,
    isIOS,
    isStandalone,
    type BeforeInstallPromptEvent,
} from "./pwa-env";
import { isInAppBrowser } from "./in-app-browser";

const DEFAULT_DECLINE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MANUAL_FALLBACK_DELAY_MS = 3000;
const DEFAULT_DECLINE_STORAGE_KEY = "tempest:install-declined-at";

let cachedEvent: BeforeInstallPromptEvent | null = null;
let installedInSession = false;
const subscribers = new Set<() => void>();

/**
 * Re-renders every mounted {@link useInstallPrompt} with the module state.
 */
function notifySubscribers(): void {
    subscribers.forEach((fn) => fn());
}

/**
 * Records that this page installed the app.
 *
 * Without it the hook forgot the install the moment the cached event was
 * cleared: with no event and no standalone display mode (the tab that installed
 * still runs in `display-mode: browser`), the fallback timer resolved to
 * `"manual"` 3 s later and every install affordance came back offering
 * "Como instalar" for an app that was already on the home screen (#619).
 */
function markInstalled(): void {
    cachedEvent = null;
    installedInSession = true;
    notifySubscribers();
}

if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (event: Event) => {
        event.preventDefault();
        cachedEvent = event as BeforeInstallPromptEvent;
        installedInSession = false;
        notifySubscribers();
    });
    window.addEventListener("appinstalled", markInstalled);
}

/**
 * Strategy the UI should use to install the app:
 *
 * - `"native"`: trigger `BeforeInstallPromptEvent.prompt()`.
 * - `"ios"`: show iOS Safari Share → Add to Home Screen instructions.
 * - `"open-in-browser"`: the page is inside an app's embedded browser
 *   (Instagram, WhatsApp, Facebook, …; see {@link isInAppBrowser}), which has no
 *   install path at all. Lead the user out to Safari on iOS or Chrome on Android.
 * - `"manual"`: show generic browser-menu instructions (Chromium forks that
 *   strip the prompt API, plus the timeout fallback when no event arrives).
 * - `"none"`: nothing to offer (running standalone, installed from this page
 *   — `appinstalled` fired or the prompt was accepted —, or unsupported runtime).
 */
export type InstallMethod = "native" | "ios" | "open-in-browser" | "manual" | "none";

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
    /** True inside an app's embedded browser — see {@link isInAppBrowser}. */
    isInAppBrowser: boolean;
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

/**
 * Whether a recorded decline is still inside its cooldown window.
 *
 * Reading is guarded because `localStorage.getItem` **throws** where this hook
 * matters most: Safari private mode and a cross-origin frame with storage
 * blocked. Unguarded, that exception escapes during render and takes the page
 * down — the install CTA is a courtesy, and no courtesy is worth a blank screen.
 *
 * @param key - Storage key holding the decline timestamp.
 * @param cooldownMs - How long a decline suppresses the CTA.
 * @returns Whether the CTA should stay hidden.
 */
function readDecline(key: string, cooldownMs: number): boolean {
    if (typeof window === "undefined") return false;
    let raw: string | null;
    try {
        raw = window.localStorage.getItem(key);
    } catch {
        return false;
    }
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < cooldownMs;
}

/**
 * React hook that resolves how (and whether) to offer PWA installation.
 *
 * It caches the `beforeinstallprompt` event, detects iOS/iPadOS, detects
 * Android Chromium forks that lack the prompt API, detects an app's embedded
 * browser, detects standalone display mode, and applies a decline cooldown persisted in `localStorage`. The
 * resulting `method` tells the UI which install affordance to render.
 *
 * An embedded browser resolves to `"open-in-browser"` ahead of `"ios"` and
 * without waiting for the fallback timer (#661). Before, every iPhone UA —
 * WhatsApp's and Instagram's included — resolved to `"ios"`, whose Share → Add to
 * Home Screen entry does not exist outside Safari; on Android the same web view
 * sat on `"none"` for 3 s and then pointed at a browser menu with no install
 * entry. A real `beforeinstallprompt` still wins over it.
 *
 * Both sides of that persistence are best-effort: `localStorage` throws in
 * Safari private mode and in a cross-origin frame with storage blocked, and an
 * exception raised while resolving an install CTA would take the page down with
 * it. A refused read means "no decline recorded"; a refused write means the CTA
 * may come back next visit.
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
    const [installed, setInstalled] = useState<boolean>(installedInSession);
    const [standalone, setStandalone] = useState<boolean>(isStandalone());
    const [promptTimedOut, setPromptTimedOut] = useState<boolean>(false);

    useEffect(() => {
        const sync = (): void => {
            setEvent(cachedEvent);
            setInstalled(installedInSession);
        };
        subscribers.add(sync);
        return () => {
            subscribers.delete(sync);
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
    const inAppBrowser = isInAppBrowser();
    const manualAndroid = isAndroidWithoutPromptApi();

    const declineActive = readDecline(declineStorageKey, declineCooldownMs);

    let method: InstallMethod = "none";
    if (!standalone && !installed && !declineActive) {
        if (event) method = "native";
        else if (inAppBrowser) method = "open-in-browser";
        else if (ios) method = "ios";
        else if (manualAndroid || promptTimedOut) method = "manual";
    }

    const recordDecline = (): void => {
        if (typeof window === "undefined") return;
        try {
            window.localStorage.setItem(declineStorageKey, String(Date.now()));
        } catch {
            /* empty */
        }
    };

    const install = async (): Promise<boolean> => {
        if (!event) return false;
        await event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome === "accepted") {
            markInstalled();
            return true;
        }
        recordDecline();
        cachedEvent = null;
        notifySubscribers();
        return false;
    };

    return {
        deferredPrompt: event,
        canInstall: method !== "none",
        isIOS: ios,
        isInAppBrowser: inAppBrowser,
        isStandalone: standalone,
        isManualAndroid: manualAndroid,
        promptTimedOut,
        method,
        openInChromeIntent: buildOpenInChromeIntent(),
        install,
        recordDecline,
    };
}

/**
 * The Chromium-only `beforeinstallprompt` event. iOS Safari never fires it —
 * for those users the app falls back to manual "Add to Home Screen"
 * instructions. Ported into the SDK so consumers get the type without a global
 * augmentation.
 */
export interface BeforeInstallPromptEvent extends Event {
    /** Platforms the prompt can target (e.g. `["web", "android"]`). */
    readonly platforms: readonly string[];
    /** Resolves once the user accepts or dismisses the prompt. */
    readonly userChoice: Promise<{
        outcome: "accepted" | "dismissed";
        platform: string;
    }>;
    /** Shows the native install prompt. */
    prompt: () => Promise<void>;
}

/**
 * Detects iOS / iPadOS Safari, including modern iPads that report `MacIntel`
 * plus multi-touch instead of an `iPad` user agent.
 *
 * @returns `true` when running on iOS/iPadOS.
 */
export function isIOS(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return ua.includes("Mac") && navigator.maxTouchPoints > 1;
}

/**
 * Detects Android browsers that ship a Chromium fork with the
 * `beforeinstallprompt` event stripped or unreliable. Those users must install
 * via the browser menu manually, identical to iOS Safari.
 *
 * @returns `true` when running on such an Android browser.
 */
export function isAndroidWithoutPromptApi(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    if (!/Android/i.test(ua)) return false;
    return /MiuiBrowser|XiaoMi|UCBrowser|Opera Mini|KAIOS|HuaweiBrowser/i.test(ua);
}

/**
 * Detects any Android browser.
 *
 * @returns `true` when the user agent reports Android.
 */
export function isAndroid(): boolean {
    if (typeof navigator === "undefined") return false;
    return /Android/i.test(navigator.userAgent);
}

/**
 * Builds an `intent://` URL that re-opens the current page inside Chrome on
 * Android. When Chrome is missing, the fallback URL points to the Play Store so
 * the user can still recover. Returns `null` outside Android.
 *
 * @returns The `intent://` URL, or `null` when not on Android or without a DOM.
 * @see https://developer.chrome.com/docs/multidevice/android/intents
 */
export function buildOpenInChromeIntent(): string | null {
    if (typeof window === "undefined") return null;
    if (!isAndroid()) return null;
    const host = window.location.host;
    const path = window.location.pathname + window.location.search;
    const fallback = encodeURIComponent(
        "https://play.google.com/store/apps/details?id=com.android.chrome",
    );
    return `intent://${host}${path}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}

/**
 * Reports whether the app is running as an installed PWA (Android Chrome, iOS,
 * or desktop). Use it to suppress install CTAs once the user is already in the
 * standalone shell.
 *
 * @returns `true` when the display mode is standalone or iOS reports standalone.
 */
export function isStandalone(): boolean {
    if (typeof window === "undefined") return false;
    if (window.matchMedia?.("(display-mode: standalone)")?.matches) return true;
    return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

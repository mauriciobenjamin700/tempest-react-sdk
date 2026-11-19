import { isIOS, isStandalone } from "./pwa-env";

/** One app whose embedded browser {@link isInAppBrowser} recognises. */
export interface InAppBrowser {
    /** Stable identifier, e.g. `"instagram"`. */
    readonly id: string;
    /** Human-readable app name, e.g. `"Instagram"`. */
    readonly name: string;
    /** Matched against `navigator.userAgent`. */
    readonly pattern: RegExp;
}

/**
 * The in-app browsers recognised by user-agent token, on iOS and on Android.
 *
 * Detection is by the token each app appends, not by the absence of `Safari/`:
 * the UAs these apps send today carry `Safari/` more often than not — WhatsApp
 * (`… Safari/604.1 [WAiOS/2.26.31]`), Instagram 393 (`… Safari/604.1)`),
 * Facebook (`… Safari/604.1 MetaIAB Facebook`), TikTok (`… Safari/604.1
 * trill_43.0.0 BytedanceWebview/…`) and Snapchat (`like Safari/…`). A rule that
 * only looked for a missing `Safari/` would have let all five through as iOS
 * Safari.
 *
 * Tokens follow the fixtures of `ua-parser-js` and `inapp-spy`; the UAs, with
 * their source, are pinned in `in-app-browser.test.ts`. Telegram adds no token
 * of its own and is detected by the globals its web view injects, inside
 * {@link isInAppBrowser}.
 */
export const IN_APP_BROWSERS: readonly InAppBrowser[] = [
    { id: "messenger", name: "Messenger", pattern: /FBAN\/Messenger|FB_IAB\/MESSENGER/ },
    { id: "facebook", name: "Facebook", pattern: /FBAN\/|FBAV\/|FB_IAB\/|MetaIAB/ },
    { id: "instagram", name: "Instagram", pattern: /\bInstagram\b/ },
    { id: "threads", name: "Threads", pattern: /\bBarcelona\b/ },
    { id: "whatsapp", name: "WhatsApp", pattern: /\b(?:WAiOS|WA4A)\// },
    { id: "line", name: "LINE", pattern: /\bLine\// },
    { id: "tiktok", name: "TikTok", pattern: /musical_ly|BytedanceWebview|\btrill_/ },
    { id: "linkedin", name: "LinkedIn", pattern: /LinkedInApp/ },
    { id: "snapchat", name: "Snapchat", pattern: /Snapchat\// },
    { id: "twitter", name: "X (Twitter)", pattern: /\bTwitter for / },
    { id: "wechat", name: "WeChat", pattern: /MicroMessenger\// },
];

const TELEGRAM_WEBVIEW_GLOBALS: readonly string[] = [
    "TelegramWebview",
    "TelegramWebviewProxy",
    "TelegramWebviewProxyProto",
];

/**
 * Reports whether the page is running inside an app's embedded browser
 * (Instagram, Facebook, Messenger, WhatsApp, LINE, TikTok, LinkedIn, Snapchat,
 * Telegram, …) rather than in a real browser. Valid on iOS and on Android.
 *
 * It matters wherever the embedded browser lacks what the real one has: on iOS
 * only Safari (and browsers that implement it, from iOS 16.4) offers Add to Home
 * Screen, so neither installation nor Web Push is reachable there; on Android
 * the web view never fires `beforeinstallprompt`. The way out on both is to
 * reopen the page in the system browser.
 *
 * Three signals, in order:
 *
 * 1. A token from {@link IN_APP_BROWSERS} in the user agent.
 * 2. A Telegram web-view global (`TelegramWebviewProxy`, …), since Telegram
 *    adds no UA token.
 * 3. On iOS only, a WebKit user agent with no `Safari/` at all. Safari, Chrome
 *    (`CriOS`), Firefox (`FxiOS`) and Edge (`EdgiOS`) on iOS all send `Safari/`,
 *    so this catches an unlisted app's `WKWebView` without touching them. It is
 *    skipped in standalone mode, where an installed web app runs.
 *
 * A Capacitor or Cordova shell is a `WKWebView` too and matches signal 3; such
 * an app should not render install affordances to begin with.
 *
 * @returns `true` inside an in-app browser; `false` otherwise or without a DOM.
 */
export function isInAppBrowser(): boolean {
    if (typeof navigator === "undefined" || typeof window === "undefined") return false;
    const ua = navigator.userAgent;
    if (IN_APP_BROWSERS.some((browser) => browser.pattern.test(ua))) return true;
    if (TELEGRAM_WEBVIEW_GLOBALS.some((key) => key in window)) return true;
    return isIOS() && /AppleWebKit\//.test(ua) && !/Safari\//.test(ua) && !isStandalone();
}

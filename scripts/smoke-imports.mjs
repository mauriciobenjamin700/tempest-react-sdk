/**
 * Entry point of the release smoke check: imports the packed tarball the way a
 * real consumer does and asserts the barrel still carries its core surface.
 *
 * This file is copied into a throwaway project by `release-npm.yml`, where
 * `tempest-react-sdk` resolves to the freshly packed tarball, and is bundled
 * with esbuild before it runs. It is not bundled for speed: since 0.63.0 every
 * component module imports its own stylesheet, and `.css` is not a format Node
 * can load, so importing the barrel in bare Node dies with
 * ERR_UNKNOWN_FILE_EXTENSION before any assertion here gets a chance to run.
 *
 * Keep the list below to symbols that are load-bearing for a consumer and that
 * come from different modules — the point is to catch a barrel that lost a
 * re-export or a subpath that failed to build, not to mirror all 564 exports.
 */
import * as sdk from "tempest-react-sdk";

const required = [
    "Button",
    "Input",
    "Modal",
    "ToastProvider",
    "useDebounce",
    "createApiClient",
    "createAuthStore",
    "ThemeProvider",
    "I18nProvider",
    "QueryProvider",
    "ErrorBoundary",
    "createOfflineStore",
    "createEventStream",
    "createWebSocket",
    "WebPushClient",
    "registerServiceWorker",
    "playAudio",
    "share",
    "cn",
    "formatCurrency",
];

const missing = required.filter((key) => !(key in sdk));
if (missing.length) {
    throw new Error("missing exports: " + missing.join(", "));
}

console.log("Smoke OK · " + Object.keys(sdk).length + " total exports");

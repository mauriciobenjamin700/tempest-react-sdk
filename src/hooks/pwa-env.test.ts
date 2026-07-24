import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildOpenInChromeIntent,
    isAndroid,
    isAndroidWithoutPromptApi,
    isIOS,
    isStandalone,
} from "./pwa-env";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const IPAD_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile Safari/537.36";
const ANDROID_MIUI = "Mozilla/5.0 (Linux; Android 13; Redmi) XiaoMi/MiuiBrowser/17.0.5";

/**
 * Point `navigator` at a fake user agent / touch-point count for one assertion.
 *
 * These helpers read the live `navigator`, so each case needs its own stub;
 * `vi.stubGlobal` is undone by the `afterEach` below.
 *
 * @param userAgent - User-agent string to report.
 * @param maxTouchPoints - Touch points to report (iPadOS pretends to be macOS
 *   and is only distinguishable by this value being > 1).
 */
function stubNavigator(userAgent: string, maxTouchPoints = 0): void {
    vi.stubGlobal("navigator", { userAgent, maxTouchPoints });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("isIOS", () => {
    it("detects iPhone/iPad/iPod user agents", () => {
        stubNavigator(IPHONE);
        expect(isIOS()).toBe(true);
    });

    it("detects modern iPadOS reporting a desktop UA plus multi-touch", () => {
        stubNavigator(IPAD_DESKTOP_UA, 5);
        expect(isIOS()).toBe(true);
    });

    it("does not mistake a real Mac for iPadOS", () => {
        stubNavigator(MAC, 0);
        expect(isIOS()).toBe(false);
    });

    it("returns false without a navigator (SSR)", () => {
        vi.stubGlobal("navigator", undefined);
        expect(isIOS()).toBe(false);
    });
});

describe("isAndroid", () => {
    it("detects Android", () => {
        stubNavigator(ANDROID_CHROME);
        expect(isAndroid()).toBe(true);
    });

    it("is false on iOS", () => {
        stubNavigator(IPHONE);
        expect(isAndroid()).toBe(false);
    });

    it("returns false without a navigator (SSR)", () => {
        vi.stubGlobal("navigator", undefined);
        expect(isAndroid()).toBe(false);
    });
});

describe("isAndroidWithoutPromptApi", () => {
    it("flags Chromium forks that strip beforeinstallprompt", () => {
        stubNavigator(ANDROID_MIUI);
        expect(isAndroidWithoutPromptApi()).toBe(true);
    });

    it("does not flag Android Chrome", () => {
        stubNavigator(ANDROID_CHROME);
        expect(isAndroidWithoutPromptApi()).toBe(false);
    });

    it("is false off Android even for a matching browser name", () => {
        stubNavigator("Mozilla/5.0 (Windows NT 10.0) UCBrowser/13.0");
        expect(isAndroidWithoutPromptApi()).toBe(false);
    });

    it("returns false without a navigator (SSR)", () => {
        vi.stubGlobal("navigator", undefined);
        expect(isAndroidWithoutPromptApi()).toBe(false);
    });
});

describe("buildOpenInChromeIntent", () => {
    it("builds an intent URL carrying host, path, query and a Play Store fallback", () => {
        stubNavigator(ANDROID_CHROME);
        vi.stubGlobal("window", {
            location: { host: "app.tempest.dev", pathname: "/orders", search: "?page=2" },
        });
        const intent = buildOpenInChromeIntent();
        expect(intent).toContain("intent://app.tempest.dev/orders?page=2");
        expect(intent).toContain("package=com.android.chrome");
        expect(intent).toContain(encodeURIComponent("id=com.android.chrome"));
    });

    it("returns null off Android", () => {
        stubNavigator(IPHONE);
        vi.stubGlobal("window", {
            location: { host: "app.tempest.dev", pathname: "/", search: "" },
        });
        expect(buildOpenInChromeIntent()).toBeNull();
    });

    it("returns null without a window (SSR)", () => {
        vi.stubGlobal("window", undefined);
        expect(buildOpenInChromeIntent()).toBeNull();
    });
});

describe("isStandalone", () => {
    it("is true when the display mode is standalone", () => {
        vi.stubGlobal("window", {
            matchMedia: (query: string) => ({ matches: query.includes("standalone") }),
            navigator: {},
        });
        expect(isStandalone()).toBe(true);
    });

    it("is true when iOS reports the legacy navigator.standalone flag", () => {
        vi.stubGlobal("window", {
            matchMedia: () => ({ matches: false }),
            navigator: { standalone: true },
        });
        expect(isStandalone()).toBe(true);
    });

    it("is false in a normal browser tab", () => {
        vi.stubGlobal("window", {
            matchMedia: () => ({ matches: false }),
            navigator: { standalone: false },
        });
        expect(isStandalone()).toBe(false);
    });

    it("survives a window without matchMedia", () => {
        vi.stubGlobal("window", { navigator: {} });
        expect(isStandalone()).toBe(false);
    });

    it("returns false without a window (SSR)", () => {
        vi.stubGlobal("window", undefined);
        expect(isStandalone()).toBe(false);
    });
});

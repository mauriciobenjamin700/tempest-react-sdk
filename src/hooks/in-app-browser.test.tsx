import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IN_APP_BROWSERS, isInAppBrowser } from "./in-app-browser";
import { useInstallPrompt } from "./use-install-prompt";

/**
 * Every UA below is copied verbatim from a public fixture, never written by hand:
 *
 * - `UAP` — `ua-parser-js` browser fixtures at commit `8b7f928`.
 * - `SPY` — `inapp-spy` mobile fixtures at commit `bd32bfd`.
 *
 * No Telegram UA is listed because Telegram adds no token: `inapp-spy` detects it
 * by the globals its web view injects, and so does `isInAppBrowser`.
 */
const UAP =
    "https://github.com/faisalman/ua-parser-js/blob/8b7f9284d56fdfa9f94d3a1939029db197b94cf2/test/data/ua/browser";
const SPY =
    "https://github.com/shalanah/inapp-spy/blob/bd32bfd9291c083b7c41b3c09dc8b1c33b5f0b7e/src/tests/mobile.ts";

interface UaFixture {
    app: string;
    platform: "ios" | "android";
    source: string;
    ua: string;
}

const IN_APP_UAS: readonly UaFixture[] = [
    {
        app: "facebook",
        platform: "ios",
        source: `${UAP}/facebook.json`,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML, like Gecko) Mobile/14E304 [FBAN/FBIOS;FBAV/91.0.0.41.73;FBBV/57050710;FBDV/iPhone8,1;FBMD/iPhone;FBSN/iOS;FBSV/10.3.1;FBSS/2;FBCR/Telekom.de;FBID/phone;FBLC/de_DE;FBOP/5;FBRV/0])",
    },
    {
        app: "facebook",
        platform: "ios",
        source: SPY,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G100 Safari/604.1 MetaIAB Facebook",
    },
    {
        app: "facebook",
        platform: "android",
        source: `${UAP}/facebook.json`,
        ua: "Mozilla/5.0 (Linux; Android 5.0; SM-G900P Build/LRX21T; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/43.0.2357.121 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/35.0.0.48.273;]",
    },
    {
        app: "facebook",
        platform: "android",
        source: SPY,
        ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240905.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.83 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/488.0.0.62.79;IABMV/1;]",
    },
    {
        app: "messenger",
        platform: "ios",
        source: SPY,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 10_2_1 like Mac OS X) AppleWebKit/602.4.6 (KHTML, like Gecko) Mobile/14D27 {useragents: [FBAN/MessengerForiOS;FBAV/117.0.0.36.70;FBBV/57539258;FBDV/iPhone7,2;FBMD/iPhone;FBSN/iOS;FBSV/10.2.1;FBSS/2;FBCR/&#20013-&#33775-&#38651-&#20449-;FBID/phone;FBLC/zh_TW;FBOP/5;FBRV/0]",
    },
    {
        app: "messenger",
        platform: "android",
        source: SPY,
        ua: "Mozilla/5.0 (Linux; Android 6.0.1; D6653 Build/23.5.A.0.575; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/58.0.3029.83 Mobile Safari/537.36 {useragents: [FB_IAB/MESSENGER;FBAV/118.0.0.19.82;]",
    },
    {
        app: "instagram",
        platform: "ios",
        source: `${UAP}/instagram.json`,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 142.0.0.22.109 (iPhone12,5; iOS 14_1; en_US; en-US; scale=3.00; 1242x2688; 214888322) NW/1",
    },
    {
        app: "instagram",
        platform: "ios",
        source: SPY,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 Instagram 393.1.0.36.70 (iPhone15,3; iOS 18_5; en_US; en; scale=3.00; 1290x2796; IABMV/1; 776538208) Safari/604.1)",
    },
    {
        app: "instagram",
        platform: "android",
        source: SPY,
        ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240905.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.58 Mobile Safari/537.36 Instagram 355.1.0.44.103 Android (34/14; 420dpi; 1080x2205; Google/google; Pixel 8; shiba; shiba; en_US; 658190016)",
    },
    {
        app: "threads",
        platform: "android",
        source: SPY,
        ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240905.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.58 Mobile Safari/537.36 Barcelona 355.0.0.39.109 Android (34/14; 420dpi; 1080x2205; Google/google; Pixel 8; shiba; shiba; en_US; 657318936)",
    },
    {
        app: "whatsapp",
        platform: "ios",
        source: `${UAP}/whatsapp.json`,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1 [WAiOS/2.26.31]",
    },
    {
        app: "whatsapp",
        platform: "ios",
        source: SPY,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Mobile/15E148 Safari/604.1 [WAiOS/2.25.31]",
    },
    {
        app: "whatsapp",
        platform: "android",
        source: `${UAP}/whatsapp.json`,
        ua: "Mozilla/5.0 (Linux; Android 16; 2311DRK48G Build/BP2A.250605.031.A3; ) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/151.0.7922.83 Mobile Safari/537.36 WA4A/2.26.30.97",
    },
    {
        app: "whatsapp",
        platform: "android",
        source: SPY,
        ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.124 Mobile Safari/537.36 [WA4A/2.25.32.75;]",
    },
    {
        app: "line",
        platform: "ios",
        source: `${UAP}/line.json`,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 11_2_6 like Mac OS X) AppleWebKit/604.5.6 (KHTML, like Gecko) Mobile/15D100 Safari Line/8.4.1",
    },
    {
        app: "line",
        platform: "android",
        source: `${UAP}/line.json`,
        ua: "Mozilla/5.0 (Linux; Android 5.0; ASUS_Z00AD Build/LRX21V; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/51.0.2704.81 Mobile Safari/537.36 Line/6.5.1/IAB",
    },
    {
        app: "tiktok",
        platform: "ios",
        source: `${UAP}/tiktok.json`,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_21.1.0 JsSdk/2.0 NetType/4G Channel/App Store ByteLocale/ru Region/RU ByteFullLocale/ru-RU isDarkMode/1 WKWebView/1 BytedanceWebview/d8a21c6",
    },
    {
        app: "tiktok",
        platform: "ios",
        source: `${UAP}/tiktok.json`,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 trill_43.0.0 BytedanceWebview/d8a21c6",
    },
    {
        app: "tiktok",
        platform: "ios",
        source: SPY,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 musical_ly_41.9.0",
    },
    {
        app: "tiktok",
        platform: "android",
        source: `${UAP}/tiktok.json`,
        ua: "Mozilla/5.0 (Linux; Android 10; STK-LX1 Build/HONORSTK-LX1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.5481.153 Mobile Safari/537.36 musical_ly_2022803040 JsSdk/1.0 NetType/WIFI Channel/huaweiadsglobal_int AppName/musical_ly app_version/28.3.4 ByteLocale/en ByteFullLocale/en Region/IQ Spark/1.2.7-alpha.8 AppVersion/28.3.4 PIA/1.5.11 BytedanceWebview/d8a21c6",
    },
    {
        app: "linkedin",
        platform: "ios",
        source: `${UAP}/linkedin.json`,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]",
    },
    {
        app: "snapchat",
        platform: "ios",
        source: `${UAP}/snapchat.json`,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Snapchat/12.33.0.36 (like Safari/8614.1.25.0.31, panda)",
    },
    {
        app: "snapchat",
        platform: "ios",
        source: SPY,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Snapchat/12.72.0.39 (like Safari/8617.2.4.10.8, panda)",
    },
    {
        app: "twitter",
        platform: "ios",
        source: SPY,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 10_2_1 like Mac OS X) AppleWebKit/602.3.12 (KHTML, like Gecko) Mobile/14D27 Twitter for iPhone",
    },
    {
        app: "wechat",
        platform: "ios",
        source: SPY,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 10_2_1 like Mac OS X) AppleWebKit/602.4.6 (KHTML, like Gecko) Mobile/14D27 MicroMessenger/6.5.8 NetType/WIFI Language/zh_CN",
    },
    {
        app: "wechat",
        platform: "android",
        source: SPY,
        ua: "Mozilla/5.0 (Linux; Android 6.0.1; D6653 Build/23.5.A.0.575; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/58.0.3029.83 Mobile Safari/537.36 MicroMessenger/6.5.7.1041 NetType/WIFI Language/zh_TW",
    },
];

const REAL_BROWSER_UAS: readonly UaFixture[] = [
    {
        app: "safari",
        platform: "ios",
        source: SPY,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    },
    {
        app: "safari",
        platform: "ios",
        source: SPY,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1",
    },
    {
        app: "chrome",
        platform: "ios",
        source: SPY,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 10_2_1 like Mac OS X) AppleWebKit/602.1.50 (KHTML, like Gecko) CriOS/58.0.3029.113 Mobile/14D27 Safari/602.1",
    },
    {
        app: "firefox",
        platform: "ios",
        source: SPY,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.1  Mobile/15E148 Safari/605.1.15",
    },
    {
        app: "firefox",
        platform: "ios",
        source: `${UAP}/mobile-firefox.json`,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/112.0 Mobile/15E148 Safari/605.1.15",
    },
    {
        app: "edge",
        platform: "ios",
        source: SPY,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/128.0.2739.82 Version/18.0 Mobile/15E148 Safari/604.1",
    },
    {
        app: "chrome",
        platform: "android",
        source: SPY,
        ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
    },
    {
        app: "chrome",
        platform: "android",
        source: `${UAP}/mobile-chrome.json`,
        ua: "Mozilla/5.0 (Linux; Android 7.1.2; Nexus 5X Build/N2G47W) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.83 Mobile Safari/537.36",
    },
];

/**
 * In-app browsers missing from {@link IN_APP_BROWSERS}, whose iOS UA carries no
 * `Safari/`: they are what the generic WKWebView rule exists for.
 */
const UNLISTED_IOS_WEBVIEW_UAS: readonly UaFixture[] = [
    {
        app: "kakaotalk",
        platform: "ios",
        source: `${UAP}/kakaotalk.json`,
        ua: "Mozilla/5.0 (iPhone; CPU; iPhone OS 15_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BizWebView KAKAOTALK 9.7.6",
    },
    {
        app: "zalo",
        platform: "ios",
        source: `${UAP}/zalo.json`,
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 13_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Zalo/20.05.01 Mobile/15E148",
    },
];

const ORIGINAL_UA = navigator.userAgent;
const ORIGINAL_MATCH_MEDIA = window.matchMedia;

function setUserAgent(ua: string): void {
    Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

afterEach(() => {
    setUserAgent(ORIGINAL_UA);
    delete (window as unknown as Record<string, unknown>).TelegramWebviewProxy;
    window.matchMedia = ORIGINAL_MATCH_MEDIA;
});

describe("isInAppBrowser", () => {
    it.each(IN_APP_UAS.map((f) => [f.app, f.platform, f] as const))(
        "recognises %s on %s",
        (_app, _platform, fixture) => {
            setUserAgent(fixture.ua);
            expect(isInAppBrowser()).toBe(true);
            expect(fixture.source).toMatch(/^https:\/\/github\.com\//);
        },
    );

    it("matches every listed app by its own token, not only by the generic rule", () => {
        for (const fixture of IN_APP_UAS) {
            const matched = IN_APP_BROWSERS.filter((browser) => browser.pattern.test(fixture.ua));
            expect(matched.map((browser) => browser.id)).toContain(fixture.app);
        }
    });

    it("leaves Safari, Chrome, Firefox and Edge alone on iOS and Android", () => {
        for (const fixture of REAL_BROWSER_UAS) {
            setUserAgent(fixture.ua);
            expect({ app: fixture.app, inApp: isInAppBrowser() }).toEqual({
                app: fixture.app,
                inApp: false,
            });
        }
    });

    it("catches an unlisted iOS WKWebView by its missing Safari/ token", () => {
        for (const fixture of UNLISTED_IOS_WEBVIEW_UAS) {
            expect(IN_APP_BROWSERS.some((browser) => browser.pattern.test(fixture.ua))).toBe(false);
            setUserAgent(fixture.ua);
            expect(isInAppBrowser()).toBe(true);
        }
    });

    it("does not flag an installed web app running standalone", () => {
        setUserAgent(UNLISTED_IOS_WEBVIEW_UAS[0]!.ua);
        window.matchMedia = ((query: string) => ({
            matches: query === "(display-mode: standalone)",
        })) as unknown as typeof window.matchMedia;
        expect(isInAppBrowser()).toBe(false);
    });

    it("recognises Telegram by the global its web view injects", () => {
        setUserAgent(REAL_BROWSER_UAS[0]!.ua);
        expect(isInAppBrowser()).toBe(false);
        (window as unknown as Record<string, unknown>).TelegramWebviewProxy = {};
        expect(isInAppBrowser()).toBe(true);
    });

    it("lists every app id once", () => {
        const ids = IN_APP_BROWSERS.map((browser) => browser.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

/**
 * Dispatches a synthetic `beforeinstallprompt`, which the hook caches at module
 * level for the rest of this file — so the tests that need no event run first.
 */
function firePromptEvent(): void {
    const event = Object.assign(new Event("beforeinstallprompt"), {
        platforms: ["web"],
        prompt: vi.fn(async () => undefined),
        userChoice: new Promise<{ outcome: "dismissed"; platform: string }>(() => undefined),
    });
    act(() => {
        window.dispatchEvent(event);
    });
}

describe("useInstallPrompt with real user agents", () => {
    afterEach(() => vi.useRealTimers());

    it.each(IN_APP_UAS.map((f) => [f.app, f.platform, f] as const))(
        "resolves %s on %s to open-in-browser at once, before the fallback timer",
        (_app, platform, fixture) => {
            setUserAgent(fixture.ua);
            const { result } = renderHook(() => useInstallPrompt());
            expect(result.current.method).toBe("open-in-browser");
            expect(result.current.isInAppBrowser).toBe(true);
            expect(result.current.canInstall).toBe(true);
            expect(result.current.openInChromeIntent !== null).toBe(platform === "android");
        },
    );

    it("keeps Safari, Chrome, Firefox and Edge on iOS on the ios method", () => {
        for (const fixture of REAL_BROWSER_UAS.filter((f) => f.platform === "ios")) {
            setUserAgent(fixture.ua);
            const { result, unmount } = renderHook(() => useInstallPrompt());
            expect({ app: fixture.app, method: result.current.method }).toEqual({
                app: fixture.app,
                method: "ios",
            });
            unmount();
        }
    });

    it("keeps Chrome on Android on the native method once the prompt event arrives", () => {
        vi.useFakeTimers();
        setUserAgent(REAL_BROWSER_UAS.find((f) => f.platform === "android")!.ua);
        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.method).toBe("none");
        firePromptEvent();
        expect(result.current.method).toBe("native");
    });

    it("lets a real install prompt win over the in-app detection", () => {
        setUserAgent(IN_APP_UAS.find((f) => f.platform === "android")!.ua);
        const { result } = renderHook(() => useInstallPrompt());
        firePromptEvent();
        expect(result.current.method).toBe("native");
        expect(result.current.isInAppBrowser).toBe(true);
    });
});

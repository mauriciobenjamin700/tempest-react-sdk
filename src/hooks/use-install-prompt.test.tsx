import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOpenInChromeIntent, isAndroid, isAndroidWithoutPromptApi, isIOS } from "./pwa-env";
import { useInstallPrompt } from "./use-install-prompt";

function setUserAgent(ua: string, maxTouchPoints = 0): void {
    Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
    Object.defineProperty(navigator, "maxTouchPoints", {
        value: maxTouchPoints,
        configurable: true,
    });
}

const ORIGINAL_UA = navigator.userAgent;

afterEach(() => {
    setUserAgent(ORIGINAL_UA);
    window.localStorage.clear();
});

describe("pwa-env helpers", () => {
    it("detects iPhone and modern iPad as iOS", () => {
        setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
        expect(isIOS()).toBe(true);
        setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5);
        expect(isIOS()).toBe(true);
    });

    it("detects Android and Chromium forks without the prompt API", () => {
        setUserAgent("Mozilla/5.0 (Linux; Android 13; MiuiBrowser/1.0)");
        expect(isAndroid()).toBe(true);
        expect(isAndroidWithoutPromptApi()).toBe(true);
        setUserAgent("Mozilla/5.0 (Linux; Android 13) Chrome/120");
        expect(isAndroidWithoutPromptApi()).toBe(false);
    });

    it("builds an intent URL only on Android", () => {
        setUserAgent("Mozilla/5.0 (Windows NT 10.0)");
        expect(buildOpenInChromeIntent()).toBeNull();
        setUserAgent("Mozilla/5.0 (Linux; Android 13) Chrome/120");
        const intent = buildOpenInChromeIntent();
        expect(intent).toContain("intent://");
        expect(intent).toContain("package=com.android.chrome");
    });
});

describe("useInstallPrompt", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("resolves the iOS method when on iOS without an event", () => {
        setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.method).toBe("ios");
        expect(result.current.canInstall).toBe(true);
    });

    it("falls back to the manual method after the timeout elapses", () => {
        setUserAgent("Mozilla/5.0 (Windows NT 10.0)");
        const { result } = renderHook(() => useInstallPrompt({ manualFallbackDelayMs: 1000 }));
        expect(result.current.method).toBe("none");
        act(() => {
            vi.advanceTimersByTime(1100);
        });
        expect(result.current.promptTimedOut).toBe(true);
        expect(result.current.method).toBe("manual");
    });

    it("suppresses the CTA while the decline cooldown is active", () => {
        setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
        window.localStorage.setItem("tempest:install-declined-at", String(Date.now()));
        const { result } = renderHook(() => useInstallPrompt({ declineCooldownMs: 60_000 }));
        expect(result.current.method).toBe("none");
        expect(result.current.canInstall).toBe(false);
    });

    it("re-offers the CTA once the cooldown has expired", () => {
        setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
        window.localStorage.setItem("tempest:install-declined-at", String(Date.now() - 120_000));
        const { result } = renderHook(() => useInstallPrompt({ declineCooldownMs: 60_000 }));
        expect(result.current.method).toBe("ios");
    });

    it("recordDecline persists a timestamp under the given key", () => {
        setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
        const { result } = renderHook(() =>
            useInstallPrompt({ declineStorageKey: "app:declined" }),
        );
        act(() => {
            result.current.recordDecline();
        });
        expect(window.localStorage.getItem("app:declined")).not.toBeNull();
    });
});

describe("useInstallPrompt — native flow and standalone", () => {
    /**
     * Fire a synthetic `beforeinstallprompt` so the module-level cache and every
     * mounted hook pick the event up, mirroring what Chromium does.
     *
     * @param outcome - What the user picks in the native dialog.
     * @returns The prompt spy so tests can assert it was invoked.
     */
    function fireBeforeInstallPrompt(outcome: "accepted" | "dismissed") {
        const prompt = vi.fn().mockResolvedValue(undefined);
        const event = Object.assign(new Event("beforeinstallprompt"), {
            platforms: ["web"],
            userChoice: Promise.resolve({ outcome, platform: "web" }),
            prompt,
            preventDefault: () => undefined,
        });
        act(() => {
            window.dispatchEvent(event);
        });
        return prompt;
    }

    it("resolves the native method once the event arrives", () => {
        const { result } = renderHook(() => useInstallPrompt());
        fireBeforeInstallPrompt("accepted");
        expect(result.current.method).toBe("native");
        expect(result.current.canInstall).toBe(true);
        expect(result.current.deferredPrompt).not.toBeNull();
    });

    it("install() prompts and reports acceptance, clearing the cached event", async () => {
        const { result } = renderHook(() => useInstallPrompt());
        const prompt = fireBeforeInstallPrompt("accepted");

        let accepted: boolean | undefined;
        await act(async () => {
            accepted = await result.current.install();
        });
        expect(prompt).toHaveBeenCalled();
        expect(accepted).toBe(true);
        expect(result.current.deferredPrompt).toBeNull();
    });

    it("install() records a decline when the user dismisses", async () => {
        const { result } = renderHook(() => useInstallPrompt({ declineStorageKey: "k" }));
        fireBeforeInstallPrompt("dismissed");

        let accepted: boolean | undefined;
        await act(async () => {
            accepted = await result.current.install();
        });
        expect(accepted).toBe(false);
        expect(window.localStorage.getItem("k")).not.toBeNull();
    });

    it("install() is a no-op with no event", async () => {
        const { result } = renderHook(() => useInstallPrompt());
        await expect(result.current.install()).resolves.toBe(false);
    });

    it("reports no install path while running standalone", () => {
        const matchMedia = vi.fn(() => ({
            matches: true,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }));
        Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });

        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.isStandalone).toBe(true);
        expect(result.current.method).toBe("none");
        expect(result.current.canInstall).toBe(false);
    });

    it("re-checks standalone on the appinstalled event", () => {
        let standalone = false;
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: () => ({
                get matches() {
                    return standalone;
                },
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }),
        });

        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.isStandalone).toBe(false);

        standalone = true;
        act(() => {
            window.dispatchEvent(new Event("appinstalled"));
        });
        expect(result.current.isStandalone).toBe(true);
    });

    it("ignores a malformed decline timestamp", () => {
        // A sibling case leaves a standalone-reporting matchMedia behind.
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: () => ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }),
        });
        window.localStorage.setItem("k", "not-a-number");
        const { result } = renderHook(() => useInstallPrompt({ declineStorageKey: "k" }));
        fireBeforeInstallPrompt("accepted");
        expect(result.current.method).toBe("native");
    });
});

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: readonly string[];
    readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
    prompt(): Promise<void>;
}

export interface UseBeforeInstallPromptResult {
    /** True when the browser fired `beforeinstallprompt` and the user has not yet decided. */
    installable: boolean;
    /** True after the user accepts the install prompt. */
    installed: boolean;
    /**
     * True when the app is already running as an installed PWA (display-mode
     * `standalone`/`fullscreen`/`minimal-ui`, or iOS `navigator.standalone`).
     * Use it to hide install affordances for users who already installed.
     */
    isStandalone: boolean;
    /** Show the install prompt. Resolves with the user's choice. */
    prompt: () => Promise<"accepted" | "dismissed" | "unsupported">;
}

/** Detect whether the document is running inside an installed PWA window. */
function detectStandalone(): boolean {
    if (typeof window === "undefined") return false;
    const displayModes = ["standalone", "fullscreen", "minimal-ui"];
    const matchesDisplayMode = displayModes.some(
        (mode) => window.matchMedia?.(`(display-mode: ${mode})`)?.matches,
    );
    // iOS Safari exposes the legacy non-standard `navigator.standalone`.
    const iosStandalone =
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    return matchesDisplayMode || iosStandalone;
}

/**
 * React hook for the PWA install prompt. Captures the `beforeinstallprompt`
 * event so you can defer the install UI to a moment that fits your UX.
 */
export function useBeforeInstallPrompt(): UseBeforeInstallPromptResult {
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
    const [installed, setInstalled] = useState<boolean>(false);
    const [isStandalone, setIsStandalone] = useState<boolean>(detectStandalone);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handler = (event: Event): void => {
            event.preventDefault();
            setDeferred(event as BeforeInstallPromptEvent);
        };
        const installedHandler = (): void => {
            setDeferred(null);
            setInstalled(true);
            setIsStandalone(true);
        };
        const displayModeQuery = window.matchMedia?.("(display-mode: standalone)");
        const displayModeHandler = (): void => setIsStandalone(detectStandalone());
        window.addEventListener("beforeinstallprompt", handler);
        window.addEventListener("appinstalled", installedHandler);
        displayModeQuery?.addEventListener("change", displayModeHandler);
        return () => {
            window.removeEventListener("beforeinstallprompt", handler);
            window.removeEventListener("appinstalled", installedHandler);
            displayModeQuery?.removeEventListener("change", displayModeHandler);
        };
    }, []);

    const prompt = useCallback(async (): Promise<"accepted" | "dismissed" | "unsupported"> => {
        if (!deferred) return "unsupported";
        await deferred.prompt();
        const result = await deferred.userChoice;
        setDeferred(null);
        if (result.outcome === "accepted") setInstalled(true);
        return result.outcome;
    }, [deferred]);

    return {
        installable: !!deferred,
        installed,
        isStandalone,
        prompt,
    };
}

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
    /** Show the install prompt. Resolves with the user's choice. */
    prompt: () => Promise<"accepted" | "dismissed" | "unsupported">;
}

/**
 * React hook for the PWA install prompt. Captures the `beforeinstallprompt`
 * event so you can defer the install UI to a moment that fits your UX.
 */
export function useBeforeInstallPrompt(): UseBeforeInstallPromptResult {
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
    const [installed, setInstalled] = useState<boolean>(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handler = (event: Event): void => {
            event.preventDefault();
            setDeferred(event as BeforeInstallPromptEvent);
        };
        const installedHandler = (): void => {
            setDeferred(null);
            setInstalled(true);
        };
        window.addEventListener("beforeinstallprompt", handler);
        window.addEventListener("appinstalled", installedHandler);
        return () => {
            window.removeEventListener("beforeinstallprompt", handler);
            window.removeEventListener("appinstalled", installedHandler);
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
        prompt,
    };
}

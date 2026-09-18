/**
 * @tempest-limits props-count — title, description, installLabel and dismissLabel
 * are four strings the app has to write, icon and className the look, storageKey the
 * dismissal memory and onResult the outcome. An install prompt with SDK-authored
 * copy is the one thing nobody ships.
 */
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";
import { Button } from "@/components/Button";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { defaultInstallHint } from "@/components/InstallButton/install-hints";
import type { RenderInstallHint } from "@/components/InstallButton/install-hints";
import type { InstallOutcome } from "@/components/InstallButton";
import styles from "./InstallBanner.module.css";

export interface InstallBannerProps {
    /** Headline. Default `"Instale o app"`. */
    title?: ReactNode;
    /** Supporting copy under the title. */
    description?: ReactNode;
    /** Install button label. Default `"Instalar"`. */
    installLabel?: string;
    /** Accessible label for the dismiss button. Default `"Dispensar"`. */
    dismissLabel?: string;
    /** Optional leading icon. */
    icon?: ReactNode;
    /**
     * `localStorage` key used to remember dismissal across reloads. Omit to
     * make dismissal last only for the current session (component state).
     */
    storageKey?: string;
    /**
     * How long, in ms, a dismissal lasts before the banner may return.
     *
     * Omitted, a dismissal written to `storageKey` is permanent, which is what
     * the component always did and what a stored `"1"` keeps meaning. With a
     * cooldown the dismissal is stored as a timestamp instead, so the banner
     * comes back after the window — the same shape `useInstallPrompt` uses for
     * its own decline.
     */
    declineCooldownMs?: number;
    /**
     * Install button label used when the browser cannot be prompted and the
     * banner shows the manual instruction. Default `"Como instalar"`.
     */
    hintLabel?: string;
    /**
     * Replaces the instruction shown for the `"ios"` and `"manual"` methods.
     *
     * The default copy is in PT-BR and names the real menu entries.
     */
    renderHint?: RenderInstallHint;
    /**
     * How long, in ms, to wait for `beforeinstallprompt` before falling back to
     * the manual instruction. Forwarded to {@link useInstallPrompt}; defaults to
     * 3000 there.
     */
    manualFallbackDelayMs?: number;
    /** Called with the user's choice after the install prompt resolves. */
    onResult?: (outcome: InstallOutcome) => void;
    className?: string;
}

/**
 * Whether the user already dismissed this banner.
 *
 * Two stored shapes, and both have to keep working: `"1"` is the permanent
 * dismissal the component has always written, and a timestamp is what a banner
 * with `declineCooldownMs` writes. A `"1"` found while a cooldown is configured
 * still counts as dismissed forever — it was written under the old contract, and
 * reviving a banner the user turned off is worse than keeping it off.
 *
 * @param storageKey - The key holding the dismissal, if any.
 * @param declineCooldownMs - How long a timestamped dismissal lasts.
 * @returns Whether the banner should stay hidden.
 */
function readDismissed(storageKey?: string, declineCooldownMs?: number): boolean {
    if (!storageKey || typeof window === "undefined") return false;
    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return false;
        if (raw === "1") return true;
        const dismissedAt = Number(raw);
        if (!Number.isFinite(dismissedAt)) return false;
        if (declineCooldownMs === undefined) return true;
        return Date.now() - dismissedAt < declineCooldownMs;
    } catch {
        return false;
    }
}

/**
 * Dismissible bottom banner that invites the user to install the PWA, wired to
 * {@link useInstallPrompt}.
 *
 * Where the browser fires `beforeinstallprompt`, the button installs. Where it
 * does not — iOS Safari, and the Android Chromium forks that strip the API — the
 * banner shows that platform's instruction instead of disappearing. It used to
 * disappear: built on `useBeforeInstallPrompt`, it rendered `null` exactly where
 * the user has no other way to find the install entry, which is why every app
 * kept a local copy of this component just to add the two missing paths.
 *
 * @tempest-limits empty-catch — persisting the dismissal is a courtesy, not the
 * feature. When `localStorage` refuses the write (quota, private mode) the banner
 * still hides for this session; the worst case is that it comes back next visit,
 * which beats an error thrown out of a click handler that only closed a banner.
 *
 * @example
 * <InstallBanner
 *     title="Instale o FAMACHApp"
 *     description="Acesso offline e atalho na tela inicial."
 *     storageKey="famacha:install-dismissed"
 * />
 */
export function InstallBanner({
    title = "Instale o app",
    description,
    installLabel = "Instalar",
    hintLabel = "Como instalar",
    dismissLabel = "Dispensar",
    icon,
    storageKey,
    declineCooldownMs,
    renderHint = defaultInstallHint,
    manualFallbackDelayMs,
    onResult,
    className,
}: InstallBannerProps) {
    const { method, openInChromeIntent, install } = useInstallPrompt({ manualFallbackDelayMs });
    const [dismissed, setDismissed] = useState<boolean>(() =>
        readDismissed(storageKey, declineCooldownMs),
    );
    const [hintOpen, setHintOpen] = useState(false);
    const hintId = useId();

    if (method === "none" || dismissed) return null;

    const dismiss = (): void => {
        setDismissed(true);
        if (storageKey && typeof window !== "undefined") {
            try {
                window.localStorage.setItem(
                    storageKey,
                    declineCooldownMs === undefined ? "1" : String(Date.now()),
                );
            } catch {
                /* empty */
            }
        }
    };

    const hint = method === "native" ? null : renderHint({ method, openInChromeIntent });

    return (
        <div className={cn(styles.banner, className)} role="region" aria-label={String(title)}>
            {icon && <span className={styles.icon}>{icon}</span>}
            <div className={styles.body}>
                <p className={styles.title}>{title}</p>
                {description && <p className={styles.description}>{description}</p>}
                {hintOpen && hint ? (
                    <p className={styles.hint} id={hintId}>
                        {hint}
                    </p>
                ) : null}
            </div>
            {method === "native" ? (
                <Button
                    size="sm"
                    onClick={async () => {
                        const accepted = await install();
                        onResult?.(accepted ? "accepted" : "dismissed");
                    }}
                >
                    {installLabel}
                </Button>
            ) : (
                <Button
                    size="sm"
                    aria-expanded={hintOpen}
                    aria-controls={hintOpen && hint ? hintId : undefined}
                    onClick={() => setHintOpen((open) => !open)}
                >
                    {hintLabel}
                </Button>
            )}
            <button
                type="button"
                className={styles.close}
                aria-label={dismissLabel}
                onClick={dismiss}
            >
                <X size={18} aria-hidden />
            </button>
        </div>
    );
}

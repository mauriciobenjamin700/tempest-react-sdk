/**
 * @tempest-limits props-count — title, description, installLabel and dismissLabel
 * are four strings the app has to write, icon and className the look, storageKey the
 * dismissal memory and onResult the outcome. visible, position and guide are the
 * three placement decisions every app made around its own copy (#619): which route
 * shows it, whether it floats above the bottom navigation, and where the full
 * install guide lives. An install prompt with SDK-authored copy is the one thing
 * nobody ships.
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

/** Where {@link InstallBanner} lays itself out. */
export type InstallBannerPosition = "inline" | "bottom";

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
    /**
     * Whether the banner renders. Default `true`.
     *
     * Hiding with this prop instead of unmounting keeps the banner's state: a
     * dismissal without `storageKey` lives only in component state, so
     * `{show && <InstallBanner />}` brought a dismissed banner back on the next
     * route that showed it. Drive it from the app's own router —
     * `visible={!pathname.startsWith("/camera")}` — so the SDK never needs a
     * router context to render.
     */
    visible?: boolean;
    /**
     * `"inline"` (default) lays the banner out where it is rendered. `"bottom"`
     * pins it to the bottom of the viewport, above the safe area and above the
     * height in `--tempest-bottom-nav-height`, which `AppShell` measures and sets
     * by itself whenever its `bottomNav` is on screen.
     */
    position?: InstallBannerPosition;
    /**
     * Rendered after the install instruction, e.g. a link to a full install
     * guide page. A node rather than an `href` so the app passes its own
     * router link and the guide opens without a full page reload.
     */
    guide?: ReactNode;
    /**
     * Called with the user's choice after the install prompt resolves. On
     * `"accepted"` the banner closes for the rest of the session.
     */
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
 * Accepting the native prompt closes the banner for the rest of the session: the
 * hook remembers the install, so the manual fallback no longer brings it back
 * offering "Como instalar" 3 s later, which is what it did before #619.
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
    visible = true,
    position = "inline",
    guide,
    onResult,
    className,
}: InstallBannerProps) {
    const { method, openInChromeIntent, install } = useInstallPrompt({ manualFallbackDelayMs });
    const [dismissed, setDismissed] = useState<boolean>(() =>
        readDismissed(storageKey, declineCooldownMs),
    );
    const [hintOpen, setHintOpen] = useState(false);
    const hintId = useId();

    if (!visible || method === "none" || dismissed) return null;

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
        <div
            className={cn(styles.banner, position === "bottom" && styles.bottom, className)}
            role="region"
            aria-label={String(title)}
        >
            {icon && <span className={styles.icon}>{icon}</span>}
            <div className={styles.body}>
                <p className={styles.title}>{title}</p>
                {description && <p className={styles.description}>{description}</p>}
                {hintOpen && hint ? (
                    <p className={styles.hint} id={hintId}>
                        {hint}
                        {guide ? <span className={styles.guide}>{guide}</span> : null}
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

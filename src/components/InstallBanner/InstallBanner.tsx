import { useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";
import { Button } from "@/components/Button";
import { useBeforeInstallPrompt } from "@/hooks/use-before-install-prompt";
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
    /** Called with the user's choice after the install prompt resolves. */
    onResult?: (outcome: InstallOutcome) => void;
    className?: string;
}

function readDismissed(storageKey?: string): boolean {
    if (!storageKey || typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(storageKey) === "1";
    } catch {
        return false;
    }
}

/**
 * Dismissible bottom banner that invites the user to install the PWA. Wired to
 * {@link useBeforeInstallPrompt}: it renders only when the browser captured an
 * install prompt and the app is not already running standalone — so on
 * platforms that never fire `beforeinstallprompt` (e.g. iOS Safari) it stays
 * hidden and you can surface manual instructions elsewhere.
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
    dismissLabel = "Dispensar",
    icon,
    storageKey,
    onResult,
    className,
}: InstallBannerProps) {
    const { installable, installed, isStandalone, prompt } = useBeforeInstallPrompt();
    const [dismissed, setDismissed] = useState<boolean>(() => readDismissed(storageKey));

    if (!installable || installed || isStandalone || dismissed) return null;

    const dismiss = (): void => {
        setDismissed(true);
        if (storageKey && typeof window !== "undefined") {
            try {
                window.localStorage.setItem(storageKey, "1");
            } catch {
                /* ignore quota errors */
            }
        }
    };

    return (
        <div className={cn(styles.banner, className)} role="region" aria-label={String(title)}>
            {icon && <span className={styles.icon}>{icon}</span>}
            <div className={styles.body}>
                <p className={styles.title}>{title}</p>
                {description && <p className={styles.description}>{description}</p>}
            </div>
            <Button
                size="sm"
                onClick={async () => {
                    onResult?.(await prompt());
                }}
            >
                {installLabel}
            </Button>
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

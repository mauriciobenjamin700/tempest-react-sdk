/**
 * @tempest-limits props-count — title, description, closeLabel, continueLabel and
 * closeBlockedMessage are five pieces of copy the app owns, onContinue is the one
 * outcome it reacts to, and className the look. A post-install message with
 * SDK-authored copy is the one thing nobody ships.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { useBeforeInstallPrompt } from "@/hooks/use-before-install-prompt";
import { cn } from "@/utils/cn";
import styles from "./PostInstallPrompt.module.css";

export interface PostInstallPromptProps {
    /** Dialog title. Default `"App instalado"`. */
    title?: ReactNode;
    /** Where the installed app is. Default PT-BR copy pointing at the home screen. */
    description?: ReactNode;
    /** Label of the button that closes this tab. Default `"Fechar esta aba"`. */
    closeLabel?: string;
    /** Label of the button that keeps using the browser. Default `"Continuar no navegador"`. */
    continueLabel?: string;
    /**
     * Shown instead of the close button when the browser will not let the page
     * close its own tab. Default PT-BR copy asking the user to close it.
     */
    closeBlockedMessage?: ReactNode;
    /** Called when the user chooses to keep using the browser (button, Escape or backdrop). */
    onContinue?: () => void;
    className?: string;
}

/**
 * Whether a script in this tab may close it.
 *
 * Mirrors the rule Chromium applies to `window.close()`, measured in headless
 * Chromium 153 (15/11/2026): a tab opened by `window.open` closes even after a
 * `pushState`; a tab opened by the user at the URL closes only while
 * `history.length` is 1 — one `pushState` and the call is ignored with "Scripts
 * may close only the windows that were opened by them." An SPA that routed even
 * once is past that point, so the button would do nothing; predicting it keeps a
 * dead button off the screen.
 *
 * @returns Whether `window.close()` is expected to work.
 */
function canScriptCloseTab(): boolean {
    if (typeof window === "undefined") return false;
    return Boolean(window.opener) || window.history.length <= 1;
}

/**
 * Overlay shown in the browser tab after the PWA is installed from it, so the
 * user learns the app is already on the home screen instead of carrying on in a
 * tab that looks unchanged.
 *
 * It opens on {@link useBeforeInstallPrompt}'s `installed`: the user accepted
 * that hook's prompt, or the browser fired `appinstalled` — which Chromium
 * browsers do whatever started the install (prompt, address-bar icon, menu).
 * Safari and Firefox never fire it, so there the overlay never opens; there is no
 * signal to open it on.
 *
 * It deliberately offers no "open the app" button: no web API launches an
 * installed PWA from a browser tab, and a link to the start URL opens in the
 * same tab on most browsers. What the tab can do is close itself, and only when
 * the browser allows it (see {@link canScriptCloseTab}); otherwise the overlay
 * says so and asks the user to close the tab and open the app from its icon.
 *
 * @example
 * <PostInstallPrompt onContinue={() => analytics.track("post_install_continue")} />
 */
export function PostInstallPrompt({
    title = "App instalado",
    description = "Ele já está na tela inicial (ou na lista de apps) do seu dispositivo. Abra por lá para usar em tela cheia.",
    closeLabel = "Fechar esta aba",
    continueLabel = "Continuar no navegador",
    closeBlockedMessage = "Este navegador não deixa a página fechar a própria aba: feche-a você e abra o app pelo ícone.",
    onContinue,
    className,
}: PostInstallPromptProps) {
    const { installed } = useBeforeInstallPrompt();
    const [dismissed, setDismissed] = useState(false);
    const [closeBlocked, setCloseBlocked] = useState(false);

    const keepBrowsing = (): void => {
        setDismissed(true);
        onContinue?.();
    };

    const closeTab = (): void => {
        window.close();
        if (!window.closed) setCloseBlocked(true);
    };

    const offerClose = !closeBlocked && canScriptCloseTab();

    return (
        <Modal
            open={installed && !dismissed}
            onClose={keepBrowsing}
            title={title}
            size="sm"
            className={cn(styles.prompt, className)}
            footer={
                <>
                    <Button variant={offerClose ? "secondary" : "primary"} onClick={keepBrowsing}>
                        {continueLabel}
                    </Button>
                    {offerClose ? <Button onClick={closeTab}>{closeLabel}</Button> : null}
                </>
            }
        >
            <p className={styles.description}>{description}</p>
            {offerClose ? null : (
                <p className={styles.note} role="status">
                    {closeBlockedMessage}
                </p>
            )}
        </Modal>
    );
}

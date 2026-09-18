import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/Button";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { cn } from "@/utils/cn";
import { defaultInstallHint, type RenderInstallHint } from "./install-hints";
import styles from "./InstallButton.module.css";

export type InstallOutcome = "accepted" | "dismissed" | "unsupported";

export interface InstallButtonProps extends Omit<ButtonProps, "onClick" | "children"> {
    /** Button label. Default `"Instalar app"`. */
    label?: ReactNode;
    /**
     * Label used when the browser cannot be prompted and the button reveals the
     * manual instruction instead. Default `"Como instalar"`.
     */
    hintLabel?: ReactNode;
    /** Called with the user's choice after the install prompt resolves. */
    onResult?: (outcome: InstallOutcome) => void;
    /**
     * Replaces the instruction shown for the `"ios"` and `"manual"` methods.
     *
     * The default copy is in PT-BR and names the real menu entries. Pass this to
     * translate it, to shorten it, or to point at a screenshot of your own.
     */
    renderHint?: RenderInstallHint;
    /**
     * How long, in ms, to wait for `beforeinstallprompt` before falling back to
     * the manual instruction. Forwarded to {@link useInstallPrompt}; defaults to
     * 3000 there.
     */
    manualFallbackDelayMs?: number;
    /** Class applied to the wrapper that holds the button and the instruction. */
    wrapperClassName?: string;
}

/**
 * Button wired to PWA installation, through {@link useInstallPrompt}.
 *
 * Where the browser fires `beforeinstallprompt`, the click installs. Where it
 * does not — iOS Safari, and the Android Chromium forks (Mi Browser, UC, Opera
 * Mini, Huawei) that strip the API — the click reveals the instruction for that
 * platform instead of the button disappearing.
 *
 * That disappearance was the defect: the component was built on
 * `useBeforeInstallPrompt`, so it rendered `null` exactly where the user needs
 * the most help, and every app re-implemented the iOS and manual paths locally.
 * Nothing renders only when there is genuinely nothing to offer — already
 * installed, running standalone, or inside the decline cooldown.
 *
 * Inherits every {@link Button} prop (`variant`, `size`, `leftIcon`, …).
 *
 * @example
 * <InstallButton variant="primary" leftIcon={<Download />} />
 *
 * @example
 * <InstallButton renderHint={({ method }) => (method === "ios" ? <IOSSteps /> : <MenuSteps />)} />
 */
export function InstallButton({
    label = "Instalar app",
    hintLabel = "Como instalar",
    onResult,
    renderHint = defaultInstallHint,
    manualFallbackDelayMs,
    wrapperClassName,
    ...props
}: InstallButtonProps) {
    const { method, openInChromeIntent, install } = useInstallPrompt({ manualFallbackDelayMs });
    const [hintOpen, setHintOpen] = useState(false);
    const hintId = useId();

    if (method === "none") return null;

    if (method === "native") {
        return (
            <Button
                onClick={async () => {
                    const accepted = await install();
                    onResult?.(accepted ? "accepted" : "dismissed");
                }}
                {...props}
            >
                {label}
            </Button>
        );
    }

    const hint = renderHint({ method, openInChromeIntent });

    return (
        <div className={cn(styles.wrapper, wrapperClassName)}>
            <Button
                aria-expanded={hintOpen}
                aria-controls={hintOpen && hint ? hintId : undefined}
                onClick={() => setHintOpen((open) => !open)}
                {...props}
            >
                {hintLabel}
            </Button>
            {hintOpen && hint ? (
                <p className={styles.hint} id={hintId}>
                    {hint}
                </p>
            ) : null}
        </div>
    );
}

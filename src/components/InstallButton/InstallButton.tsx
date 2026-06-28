import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/Button";
import { useBeforeInstallPrompt } from "@/hooks/use-before-install-prompt";

export type InstallOutcome = "accepted" | "dismissed" | "unsupported";

export interface InstallButtonProps extends Omit<ButtonProps, "onClick" | "children"> {
    /** Button label. Default `"Instalar app"`. */
    label?: ReactNode;
    /** Called with the user's choice after the install prompt resolves. */
    onResult?: (outcome: InstallOutcome) => void;
}

/**
 * Button wired to the PWA install prompt ({@link useBeforeInstallPrompt}).
 * Renders nothing when the app can't be installed — no prompt captured yet,
 * already installed, or running standalone — so you can drop it anywhere
 * without guarding visibility yourself.
 *
 * Inherits every {@link Button} prop (`variant`, `size`, `leftIcon`, …).
 *
 * @example
 * <InstallButton variant="primary" leftIcon={<Download />} />
 */
export function InstallButton({ label = "Instalar app", onResult, ...props }: InstallButtonProps) {
    const { installable, installed, isStandalone, prompt } = useBeforeInstallPrompt();
    if (!installable || installed || isStandalone) return null;
    return (
        <Button
            onClick={async () => {
                onResult?.(await prompt());
            }}
            {...props}
        >
            {label}
        </Button>
    );
}

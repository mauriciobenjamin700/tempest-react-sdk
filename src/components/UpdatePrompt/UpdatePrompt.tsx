import type { HTMLAttributes, ReactNode } from "react";
import { RefreshCw, X } from "lucide-react";
import { cn } from "@/utils/cn";
import styles from "./UpdatePrompt.module.css";

export type UpdatePromptPosition = "top" | "bottom";

export interface UpdatePromptProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /** Whether the prompt is visible. Feed from `useServiceWorkerUpdate().updateAvailable`. */
    open: boolean;
    /** Called when the user confirms the update. Wire to `applyUpdate`. */
    onUpdate: () => void;
    /** Called when the user dismisses the prompt. Omit to hide the dismiss button. */
    onDismiss?: () => void;
    /** Body message. */
    message?: ReactNode;
    /** Confirm button label. Default `"Atualizar"`. */
    actionLabel?: string;
    /** Where to pin the fixed toast. Default `"bottom"`. */
    position?: UpdatePromptPosition;
}

/**
 * Fixed toast prompting the user to activate a freshly installed service
 * worker. Presentational — pair with {@link useServiceWorkerUpdate}, feeding
 * `updateAvailable` to `open` and `applyUpdate` to `onUpdate`.
 *
 * Renders nothing while `open` is `false`.
 *
 * @example
 * const { updateAvailable, applyUpdate } = useServiceWorkerUpdate({ url: "/sw.js" });
 * <UpdatePrompt open={updateAvailable} onUpdate={applyUpdate} />
 */
export function UpdatePrompt({
    open,
    onUpdate,
    onDismiss,
    message = "Uma nova versão está disponível.",
    actionLabel = "Atualizar",
    position = "bottom",
    className,
    ...props
}: UpdatePromptProps) {
    if (!open) return null;
    return (
        <div
            className={cn(styles.prompt, styles[position], className)}
            role="alert"
            aria-live="assertive"
            {...props}
        >
            <RefreshCw className={styles.icon} size={18} aria-hidden="true" />
            <span className={styles.message}>{message}</span>
            <button type="button" className={styles.action} onClick={onUpdate}>
                {actionLabel}
            </button>
            {onDismiss && (
                <button
                    type="button"
                    className={styles.dismiss}
                    aria-label="Dispensar"
                    onClick={onDismiss}
                >
                    <X size={16} aria-hidden="true" />
                </button>
            )}
        </div>
    );
}

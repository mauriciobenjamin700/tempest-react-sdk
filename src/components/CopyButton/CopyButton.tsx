import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import styles from "./CopyButton.module.css";

export interface CopyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** Text written to the clipboard when the button is clicked. */
    value: string;
    /** How long (ms) the "copied" state stays active before resetting. Defaults to 2000. */
    timeout?: number;
    /** Optional label. Falls back to "Copy" / "Copied" based on state. */
    children?: ReactNode;
    /** Called after a successful clipboard write. */
    onCopied?: () => void;
}

/**
 * Button that copies a string to the clipboard and shows a transient "copied"
 * state for `timeout` milliseconds.
 *
 * When `children` are provided they are rendered in both states; otherwise the
 * label toggles between "Copy" and "Copied". The reset timer is cleared on
 * unmount to avoid setting state on an unmounted component.
 *
 * @example
 * <CopyButton value="npm i tempest-react-sdk" />
 */
export function CopyButton({
    value,
    timeout = 2000,
    children,
    onCopied,
    className,
    onClick,
    ...props
}: CopyButtonProps) {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (timerRef.current !== null) clearTimeout(timerRef.current);
        };
    }, []);

    const handleClick = useCallback(
        async (event: React.MouseEvent<HTMLButtonElement>) => {
            onClick?.(event);
            try {
                await navigator.clipboard.writeText(value);
                setCopied(true);
                onCopied?.();
                if (timerRef.current !== null) clearTimeout(timerRef.current);
                timerRef.current = setTimeout(() => setCopied(false), timeout);
            } catch {
                /* clipboard unavailable — silently ignore */
            }
        },
        [value, timeout, onCopied, onClick],
    );

    return (
        <button
            type="button"
            className={cn(styles.button, copied && styles.copied, className)}
            data-copied={copied || undefined}
            onClick={handleClick}
            {...props}
        >
            {children ?? (copied ? "Copied" : "Copy")}
        </button>
    );
}

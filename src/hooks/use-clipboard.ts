import { useCallback, useEffect, useRef, useState } from "react";

export interface UseClipboardOptions {
    /** Time (ms) before the `copied` flag resets back to false. Default: 1500. */
    resetAfter?: number;
}

export interface UseClipboardResult {
    /** True briefly after a successful copy. */
    copied: boolean;
    /** Copy a string to the clipboard. Returns `true` on success. */
    copy: (text: string) => Promise<boolean>;
    /** Manually reset the `copied` flag. */
    reset: () => void;
}

/**
 * Wrapper around `navigator.clipboard.writeText` with a transient `copied`
 * flag for UI feedback ("Copied!" toast). Falls back gracefully when the
 * Clipboard API is unavailable.
 */
export function useClipboard(options: UseClipboardOptions = {}): UseClipboardResult {
    const { resetAfter = 1500 } = options;
    const [copied, setCopied] = useState<boolean>(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const reset = useCallback((): void => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        setCopied(false);
    }, []);

    useEffect(() => () => reset(), [reset]);

    const copy = useCallback(
        async (text: string): Promise<boolean> => {
            try {
                if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                } else if (typeof document !== "undefined") {
                    const textarea = document.createElement("textarea");
                    textarea.value = text;
                    textarea.style.position = "fixed";
                    textarea.style.opacity = "0";
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textarea);
                } else {
                    return false;
                }
                setCopied(true);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => setCopied(false), resetAfter);
                return true;
            } catch {
                return false;
            }
        },
        [resetAfter],
    );

    return { copied, copy, reset };
}

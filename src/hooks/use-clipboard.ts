import { useCallback, useEffect, useRef, useState } from "react";

import { writeToClipboard } from "@/share/write-to-clipboard";

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
 * Clipboard write with a transient `copied` flag for UI feedback ("Copied!"
 * toast).
 *
 * Tries `navigator.clipboard.writeText` and, when it is missing **or rejects**
 * (an embedded web view without the permission), `execCommand("copy")` on an
 * off-screen `<textarea>` — the same chain `InstallCopyLink` and `ShareActions`
 * use. `copy` resolves `false`, and `copied` stays `false`, when the browser
 * refused both: an `execCommand` that returns `false` is a failed copy, not a
 * success.
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
            if (!(await writeToClipboard(text))) return false;
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), resetAfter);
            return true;
        },
        [resetAfter],
    );

    return { copied, copy, reset };
}

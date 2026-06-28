import { useEffect } from "react";

/**
 * Set `document.title` while the component is mounted, restoring the previous
 * title on unmount. SSR-safe — no-op when `document` is unavailable.
 *
 * @param title - the title to apply.
 */
export function useDocumentTitle(title: string): void {
    useEffect(() => {
        if (typeof document === "undefined") return;
        const previous = document.title;
        document.title = title;
        return () => {
            document.title = previous;
        };
    }, [title]);
}

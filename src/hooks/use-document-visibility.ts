import { useEffect, useState } from "react";

export type DocumentVisibility = "visible" | "hidden";

/** Subscribe to `document.visibilityState`. Returns `"visible"` during SSR. */
export function useDocumentVisibility(): DocumentVisibility {
    const [state, setState] = useState<DocumentVisibility>(() =>
        typeof document === "undefined"
            ? "visible"
            : (document.visibilityState as DocumentVisibility),
    );

    useEffect(() => {
        if (typeof document === "undefined") return;
        const handler = (): void => setState(document.visibilityState as DocumentVisibility);
        document.addEventListener("visibilitychange", handler);
        return () => document.removeEventListener("visibilitychange", handler);
    }, []);

    return state;
}

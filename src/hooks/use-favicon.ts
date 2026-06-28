import { useEffect } from "react";

/**
 * Swap the document favicon by updating the `<link rel="icon">` href.
 * Creates the link element when it is missing. SSR-safe — no-op when
 * `document` is unavailable.
 *
 * @param href - the favicon URL to apply.
 */
export function useFavicon(href: string): void {
    useEffect(() => {
        if (typeof document === "undefined") return;
        let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
        }
        link.href = href;
    }, [href]);
}

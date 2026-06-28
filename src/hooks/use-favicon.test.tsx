import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useFavicon } from "./use-favicon";

describe("useFavicon", () => {
    afterEach(() => {
        document.head.querySelectorAll('link[rel="icon"]').forEach((node) => node.remove());
    });

    it("creates a link when none exists", () => {
        renderHook(() => useFavicon("/icon.png"));
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        expect(link).not.toBeNull();
        expect(link?.getAttribute("href")).toContain("/icon.png");
    });

    it("reuses an existing link", () => {
        const existing = document.createElement("link");
        existing.rel = "icon";
        existing.href = "/old.png";
        document.head.appendChild(existing);

        renderHook(() => useFavicon("/new.png"));
        const links = document.querySelectorAll('link[rel="icon"]');
        expect(links.length).toBe(1);
        expect((links[0] as HTMLLinkElement).getAttribute("href")).toContain("/new.png");
    });

    it("updates href when it changes", () => {
        const { rerender } = renderHook(({ href }) => useFavicon(href), {
            initialProps: { href: "/a.png" },
        });
        let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        expect(link?.getAttribute("href")).toContain("/a.png");
        rerender({ href: "/b.png" });
        link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        expect(link?.getAttribute("href")).toContain("/b.png");
    });
});

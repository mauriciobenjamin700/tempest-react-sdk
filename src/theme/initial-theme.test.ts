import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getInitialTheme, themeInitScript } from "./initial-theme";

beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
});

describe("getInitialTheme", () => {
    afterEach(() => window.localStorage.clear());

    it("returns stored value when present", () => {
        window.localStorage.setItem("tempest-theme", "dark");
        expect(getInitialTheme()).toBe("dark");
    });

    it("falls back to system preference when no value stored", () => {
        const result = getInitialTheme();
        expect(["light", "dark"]).toContain(result);
    });

    it("respects custom storageKey", () => {
        window.localStorage.setItem("custom", "light");
        expect(getInitialTheme({ storageKey: "custom" })).toBe("light");
    });
});

describe("themeInitScript", () => {
    it("returns an inlinable script string", () => {
        const script = themeInitScript();
        expect(script).toContain("data-tempest-theme");
        expect(script).toContain("tempest-theme");
    });

    it("keeps an option containing </script> inside its own script element", () => {
        const storageKey = "</script><script>window.__pwned=1</script>";
        const html = `<head><script>${themeInitScript({ storageKey })}</script></head>`;
        const parsed = new DOMParser().parseFromString(html, "text/html");
        expect(parsed.querySelectorAll("script")).toHaveLength(1);
    });

    it("escapes <, >, & and the line separators, and still reads the same key back", () => {
        const storageKey = "a</b>&c\u2028d\u2029e";
        const script = themeInitScript({ storageKey });
        expect(script).not.toMatch(/[<>&\u2028\u2029]/);
        localStorage.setItem(storageKey, "dark");
        try {
            new Function(script)();
            expect(document.documentElement.getAttribute("data-tempest-theme")).toBe("dark");
        } finally {
            localStorage.removeItem(storageKey);
            document.documentElement.removeAttribute("data-tempest-theme");
        }
    });
});

describe("getInitialTheme — fallbacks", () => {
    it("returns the default theme without a window (SSR-less bootstrap)", () => {
        const original = globalThis.window;
        vi.stubGlobal("window", undefined);
        expect(getInitialTheme({ defaultTheme: "dark" })).toBe("dark");
        expect(getInitialTheme({ defaultTheme: "light" })).toBe("light");
        expect(getInitialTheme({ defaultTheme: "system" })).toBe("light");
        vi.stubGlobal("window", original);
    });

    it("survives a localStorage that throws", () => {
        const getItem = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        expect(["dark", "light"]).toContain(getInitialTheme());
        getItem.mockRestore();
    });

    it("honours an explicit defaultTheme when nothing is stored", () => {
        window.localStorage.clear();
        expect(getInitialTheme({ defaultTheme: "dark" })).toBe("dark");
    });

    it("ignores storage that throws on read, whatever object holds it", () => {
        const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });

        expect(["dark", "light"]).toContain(getInitialTheme({ storageKey: "t:theme" }));

        getItem.mockRestore();
    });
});

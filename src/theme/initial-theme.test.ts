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
});

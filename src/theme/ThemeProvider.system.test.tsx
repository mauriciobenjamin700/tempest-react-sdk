import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeProvider";

let currentMatches = false;
let mediaListeners: ((event: MediaQueryListEvent) => void)[] = [];

beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (query: string) => ({
            matches: currentMatches,
            media: query,
            addEventListener: (_name: string, listener: (event: MediaQueryListEvent) => void) => {
                mediaListeners.push(listener);
            },
            removeEventListener: (
                _name: string,
                listener: (event: MediaQueryListEvent) => void,
            ) => {
                mediaListeners = mediaListeners.filter((l) => l !== listener);
            },
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }),
    });
});

afterEach(() => {
    currentMatches = false;
    mediaListeners = [];
});

describe("ThemeProvider system mode", () => {
    it("respects prefers-color-scheme: dark", () => {
        currentMatches = true;
        const wrapper = ({ children }: { children: ReactNode }) => (
            <ThemeProvider defaultTheme="system" storageKey={null}>
                {children}
            </ThemeProvider>
        );
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(result.current.resolvedTheme).toBe("dark");
    });

    it("returns light when OS prefers light", () => {
        currentMatches = false;
        const wrapper = ({ children }: { children: ReactNode }) => (
            <ThemeProvider defaultTheme="system" storageKey={null}>
                {children}
            </ThemeProvider>
        );
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(result.current.resolvedTheme).toBe("light");
    });
});

describe("ThemeProvider system mode — OS change listener", () => {
    beforeEach(() => {
        // The shared stub snapshots `matches` at construction; the change handler
        // re-reads `list.matches`, so this variant exposes it as a live getter.
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            writable: true,
            value: (query: string) => ({
                get matches() {
                    return currentMatches;
                },
                media: query,
                addEventListener: (
                    _name: string,
                    listener: (event: MediaQueryListEvent) => void,
                ) => {
                    mediaListeners.push(listener);
                },
                removeEventListener: (
                    _name: string,
                    listener: (event: MediaQueryListEvent) => void,
                ) => {
                    mediaListeners = mediaListeners.filter((l) => l !== listener);
                },
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }),
        });
    });

    /** Fire every registered `prefers-color-scheme` listener. */
    function emitOsChange(dark: boolean): void {
        currentMatches = dark;
        act(() => {
            for (const listener of mediaListeners) {
                listener({ matches: dark } as MediaQueryListEvent);
            }
        });
    }

    it("follows the OS switching to dark and back", () => {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <ThemeProvider defaultTheme="system" storageKey={null}>
                {children}
            </ThemeProvider>
        );
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(result.current.resolvedTheme).toBe("light");

        emitOsChange(true);
        expect(result.current.resolvedTheme).toBe("dark");
        expect(document.documentElement.getAttribute("data-tempest-theme")).toBe("dark");

        emitOsChange(false);
        expect(result.current.resolvedTheme).toBe("light");
    });

    it("mirrors the OS change onto every configured attribute", () => {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <ThemeProvider
                defaultTheme="system"
                storageKey={null}
                attribute={["data-tempest-theme", "data-theme"]}
            >
                {children}
            </ThemeProvider>
        );
        renderHook(() => useTheme(), { wrapper });
        emitOsChange(true);
        expect(document.documentElement.getAttribute("data-tempest-theme")).toBe("dark");
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("syncs the theme-color meta tag on an OS change", () => {
        const meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        meta.setAttribute("content", "#ffffff");
        document.head.appendChild(meta);

        const wrapper = ({ children }: { children: ReactNode }) => (
            <ThemeProvider
                defaultTheme="system"
                storageKey={null}
                themeColor={{ light: "#ffffff", dark: "#101014" }}
            >
                {children}
            </ThemeProvider>
        );
        renderHook(() => useTheme(), { wrapper });
        emitOsChange(true);
        expect(meta.content).toBe("#101014");
        meta.remove();
    });

    it("writes the OS change to a custom target", () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const wrapper = ({ children }: { children: ReactNode }) => (
            <ThemeProvider defaultTheme="system" storageKey={null} target={() => host}>
                {children}
            </ThemeProvider>
        );
        renderHook(() => useTheme(), { wrapper });
        emitOsChange(true);
        expect(host.getAttribute("data-tempest-theme")).toBe("dark");
        host.remove();
    });

    it("stops listening once the theme is pinned to an explicit mode", () => {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <ThemeProvider defaultTheme="system" storageKey={null}>
                {children}
            </ThemeProvider>
        );
        const { result } = renderHook(() => useTheme(), { wrapper });
        act(() => result.current.setTheme("light"));
        expect(mediaListeners).toHaveLength(0);

        emitOsChange(true);
        expect(result.current.resolvedTheme).toBe("light");
    });

    it("detaches the listener on unmount", () => {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <ThemeProvider defaultTheme="system" storageKey={null}>
                {children}
            </ThemeProvider>
        );
        const { unmount } = renderHook(() => useTheme(), { wrapper });
        expect(mediaListeners.length).toBeGreaterThan(0);
        unmount();
        expect(mediaListeners).toHaveLength(0);
    });
});

import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
            removeEventListener: (_name: string, listener: (event: MediaQueryListEvent) => void) => {
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

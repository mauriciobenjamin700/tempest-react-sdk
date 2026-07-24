import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeProvider";

describe("ThemeProvider persistence", () => {
    afterEach(() => window.localStorage.clear());

    it("persists user choice in localStorage", () => {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <ThemeProvider defaultTheme="light" storageKey="t">
                {children}
            </ThemeProvider>
        );
        const { result } = renderHook(() => useTheme(), { wrapper });
        act(() => result.current.setTheme("dark"));
        expect(window.localStorage.getItem("t")).toBe("dark");
    });

    it("reads stored choice on mount", () => {
        window.localStorage.setItem("t2", "dark");
        const wrapper = ({ children }: { children: ReactNode }) => (
            <ThemeProvider defaultTheme="light" storageKey="t2">
                {children}
            </ThemeProvider>
        );
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(result.current.theme).toBe("dark");
    });
});

describe("ThemeProvider — storage and target edges", () => {
    beforeEach(() => {
        // `system` mode reads prefers-color-scheme; jsdom has no matchMedia and
        // sibling suites replace the shared stub, so each case installs its own.
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            writable: true,
            value: (query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
                addListener: () => undefined,
                removeListener: () => undefined,
                dispatchEvent: () => false,
            }),
        });
    });

    /** Wrapper factory so each case can pass its own provider props. */
    function wrapperWith(props: Partial<Parameters<typeof ThemeProvider>[0]>) {
        return ({ children }: { children: ReactNode }) => (
            <ThemeProvider {...props}>{children}</ThemeProvider>
        );
    }

    it("ignores a stored value that is not a theme mode", () => {
        window.localStorage.setItem("t", "neon");
        const { result } = renderHook(() => useTheme(), {
            wrapper: wrapperWith({ defaultTheme: "dark", storageKey: "t" }),
        });
        expect(result.current.theme).toBe("dark");
    });

    it("does not persist when storageKey is null", () => {
        const { result } = renderHook(() => useTheme(), {
            wrapper: wrapperWith({ storageKey: null }),
        });
        act(() => result.current.setTheme("dark"));
        expect(window.localStorage.getItem("tempest-theme")).toBeNull();
        expect(result.current.theme).toBe("dark");
    });

    it("survives a localStorage that throws on read", () => {
        const getItem = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        const { result } = renderHook(() => useTheme(), {
            wrapper: wrapperWith({ defaultTheme: "light", storageKey: "t" }),
        });
        expect(result.current.theme).toBe("light");
        getItem.mockRestore();
    });

    it("survives a localStorage that throws on write", () => {
        const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
            throw new Error("quota");
        });
        const { result } = renderHook(() => useTheme(), {
            wrapper: wrapperWith({ defaultTheme: "light", storageKey: "t" }),
        });
        act(() => result.current.setTheme("dark"));
        expect(result.current.theme).toBe("dark");
        setItem.mockRestore();
    });

    it("writes onto a custom target element", () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        renderHook(() => useTheme(), {
            wrapper: wrapperWith({ defaultTheme: "dark", target: () => host }),
        });
        expect(host.getAttribute("data-tempest-theme")).toBe("dark");
        host.remove();
    });

    it("falls back to documentElement when the target resolver returns null", () => {
        renderHook(() => useTheme(), {
            wrapper: wrapperWith({ defaultTheme: "dark", target: () => null }),
        });
        expect(document.documentElement.getAttribute("data-tempest-theme")).toBe("dark");
    });

    it("toggle from system mode flips the resolved theme", () => {
        const { result } = renderHook(() => useTheme(), {
            wrapper: wrapperWith({ defaultTheme: "system", storageKey: "t" }),
        });
        const before = result.current.resolvedTheme;
        act(() => result.current.toggle());
        expect(result.current.theme).toBe(before === "dark" ? "light" : "dark");
    });
});

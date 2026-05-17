import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeProvider";

function makeWrapper(defaultTheme: "light" | "dark" | "system" = "light") {
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <ThemeProvider defaultTheme={defaultTheme} storageKey={null}>
                {children}
            </ThemeProvider>
        );
    };
}

describe("ThemeProvider + useTheme", () => {
    it("applies the default theme to documentElement", () => {
        renderHook(() => useTheme(), { wrapper: makeWrapper("dark") });
        expect(document.documentElement.getAttribute("data-tempest-theme")).toBe("dark");
    });

    it("setTheme updates resolvedTheme", () => {
        const { result } = renderHook(() => useTheme(), { wrapper: makeWrapper("light") });
        act(() => result.current.setTheme("dark"));
        expect(result.current.resolvedTheme).toBe("dark");
    });

    it("toggle flips light/dark", () => {
        const { result } = renderHook(() => useTheme(), { wrapper: makeWrapper("light") });
        act(() => result.current.toggle());
        expect(result.current.resolvedTheme).toBe("dark");
        act(() => result.current.toggle());
        expect(result.current.resolvedTheme).toBe("light");
    });

    it("throws outside provider", () => {
        expect(() => renderHook(() => useTheme())).toThrow();
    });
});

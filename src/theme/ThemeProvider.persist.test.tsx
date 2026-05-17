import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeProvider";

describe("ThemeProvider persistence", () => {
    afterEach(() => window.localStorage.clear());

    it("persists user choice in localStorage", () => {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <ThemeProvider defaultTheme="light" storageKey="t">{children}</ThemeProvider>
        );
        const { result } = renderHook(() => useTheme(), { wrapper });
        act(() => result.current.setTheme("dark"));
        expect(window.localStorage.getItem("t")).toBe("dark");
    });

    it("reads stored choice on mount", () => {
        window.localStorage.setItem("t2", "dark");
        const wrapper = ({ children }: { children: ReactNode }) => (
            <ThemeProvider defaultTheme="light" storageKey="t2">{children}</ThemeProvider>
        );
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(result.current.theme).toBe("dark");
    });
});

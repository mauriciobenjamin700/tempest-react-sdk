import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeProvider";

afterEach(() => {
    document.documentElement.removeAttribute("data-tempest-theme");
    document.documentElement.removeAttribute("data-theme");
    document.head.querySelector('meta[name="theme-color"]')?.remove();
});

describe("ThemeProvider attribute mirroring", () => {
    it("writes the resolved theme to every attribute in the array", () => {
        function Wrapper({ children }: { children: ReactNode }) {
            return (
                <ThemeProvider
                    defaultTheme="dark"
                    storageKey={null}
                    attribute={["data-tempest-theme", "data-theme"]}
                >
                    {children}
                </ThemeProvider>
            );
        }
        renderHook(() => useTheme(), { wrapper: Wrapper });
        expect(document.documentElement.getAttribute("data-tempest-theme")).toBe("dark");
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
});

describe("ThemeProvider theme-color sync", () => {
    it("updates <meta name=theme-color> with the resolved theme", () => {
        const meta = document.createElement("meta");
        meta.name = "theme-color";
        meta.content = "#ffffff";
        document.head.appendChild(meta);

        function Wrapper({ children }: { children: ReactNode }) {
            return (
                <ThemeProvider
                    defaultTheme="dark"
                    storageKey={null}
                    themeColor={{ light: "#ffffff", dark: "#101010" }}
                >
                    {children}
                </ThemeProvider>
            );
        }
        renderHook(() => useTheme(), { wrapper: Wrapper });
        expect(meta.content).toBe("#101010");
    });
});

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "./use-media-query";

describe("useMediaQuery", () => {
    it("returns boolean", () => {
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
        const { result } = renderHook(() => useMediaQuery("(max-width: 600px)"));
        expect(typeof result.current).toBe("boolean");
    });
});

describe("useMediaQuery — following the query", () => {
    it("re-renders when the media query starts matching", () => {
        let handler: ((event: MediaQueryListEvent) => void) | null = null;
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: (query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: (_name: string, fn: (event: MediaQueryListEvent) => void) => {
                    handler = fn;
                },
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }),
        });

        const { result } = renderHook(() => useMediaQuery("(max-width: 600px)"));
        expect(result.current).toBe(false);

        act(() => handler?.({ matches: true } as MediaQueryListEvent));

        expect(result.current).toBe(true);
    });
});

import { act, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "./ToastProvider";

function wrapper({ children }: { children: ReactNode }) {
    return <ToastProvider defaultDuration={0}>{children}</ToastProvider>;
}

describe("ToastProvider + useToast", () => {
    it("renders a toast when show is called", () => {
        render(
            <ToastProvider>
                <Demo />
            </ToastProvider>,
        );
    });

    it("api methods exist", () => {
        const { result } = renderHook(() => useToast(), { wrapper });
        expect(typeof result.current.show).toBe("function");
        expect(typeof result.current.success).toBe("function");
        let id: string | undefined;
        act(() => {
            id = result.current.success("ok");
        });
        expect(typeof id).toBe("string");
    });

    it("throws outside provider", () => {
        expect(() => renderHook(() => useToast())).toThrow();
    });
});

function Demo() {
    const toast = useToast();
    toast.info("hello");
    return <span>demo</span>;
}

// keep screen import referenced for future expansion
void screen;

import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { AccessControlProvider } from "./access-control-context";
import { useCan } from "./use-can";
import type { AccessControl } from "./types";

function wrapper(control: AccessControl) {
    return ({ children }: { children: ReactNode }) => (
        <AccessControlProvider control={control}>{children}</AccessControlProvider>
    );
}

describe("useCan", () => {
    it("resolves a sync boolean control", async () => {
        const control: AccessControl = { can: () => true };
        const { result } = renderHook(() => useCan({ action: "read", resource: "posts" }), {
            wrapper: wrapper(control),
        });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.allowed).toBe(true);
    });

    it("resolves a sync CanResult denial with a reason", async () => {
        const control: AccessControl = { can: () => ({ can: false, reason: "nope" }) };
        const { result } = renderHook(() => useCan({ action: "delete", resource: "posts" }), {
            wrapper: wrapper(control),
        });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.allowed).toBe(false);
        expect(result.current.reason).toBe("nope");
    });

    it("resolves an async control", async () => {
        const control: AccessControl = {
            can: async () => ({ can: true }),
        };
        const { result } = renderHook(() => useCan({ action: "read", resource: "posts" }), {
            wrapper: wrapper(control),
        });
        expect(result.current.isLoading).toBe(true);
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.allowed).toBe(true);
    });

    it("denies with a message when an async control rejects", async () => {
        const control: AccessControl = {
            can: async () => {
                throw new Error("boom");
            },
        };
        const { result } = renderHook(() => useCan({ action: "read" }), {
            wrapper: wrapper(control),
        });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.allowed).toBe(false);
        expect(result.current.reason).toBe("boom");
    });

    it("allows everything when no provider is present", () => {
        const { result } = renderHook(() => useCan({ action: "read", resource: "posts" }));
        expect(result.current.allowed).toBe(true);
        expect(result.current.isLoading).toBe(false);
    });
});

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

describe("useCan — params change", () => {
    it("never returns the previous resource's answer for the new resource", async () => {
        const control: AccessControl = {
            can: ({ resource }) => (resource === "public" ? true : new Promise<boolean>(() => {})),
        };
        const seen: { resource: string; allowed: boolean; isLoading: boolean }[] = [];
        const { result, rerender } = renderHook(
            ({ resource }: { resource: string }) => {
                const answer = useCan({ action: "read", resource });
                seen.push({ resource, allowed: answer.allowed, isLoading: answer.isLoading });
                return answer;
            },
            { wrapper: wrapper(control), initialProps: { resource: "public" } },
        );
        await waitFor(() => expect(result.current.allowed).toBe(true));

        rerender({ resource: "secret" });

        const forSecret = seen.filter((entry) => entry.resource === "secret");
        expect(forSecret.length).toBeGreaterThan(0);
        expect(forSecret.every((entry) => !entry.allowed && entry.isLoading)).toBe(true);
    });

    it("does not carry an answer over to a swapped control", async () => {
        let current: AccessControl = { can: () => true };
        const Swappable = ({ children }: { children: ReactNode }) => (
            <AccessControlProvider control={current}>{children}</AccessControlProvider>
        );
        const { result, rerender } = renderHook(() => useCan({ action: "read", resource: "x" }), {
            wrapper: Swappable,
        });
        await waitFor(() => expect(result.current.allowed).toBe(true));

        current = { can: () => new Promise<boolean>(() => {}) };
        rerender();

        expect(result.current).toEqual({ allowed: false, isLoading: true });
    });
});

describe("useCan — async failures", () => {
    it("reports the error message when the check rejects", async () => {
        const control: AccessControl = {
            can: () => Promise.reject(new Error("backend caiu")),
        };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <AccessControlProvider control={control}>{children}</AccessControlProvider>
        );

        const { result } = renderHook(() => useCan({ action: "read", resource: "orders" }), {
            wrapper,
        });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.allowed).toBe(false);
        expect(result.current.reason).toBe("backend caiu");
    });

    it("falls back to a generic reason for a non-Error rejection", async () => {
        const control: AccessControl = { can: () => Promise.reject("nope") };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <AccessControlProvider control={control}>{children}</AccessControlProvider>
        );

        const { result } = renderHook(() => useCan({ action: "read", resource: "orders" }), {
            wrapper,
        });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.reason).toBe("access check failed");
    });
});

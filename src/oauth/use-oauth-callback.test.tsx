import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useOAuthCallback } from "./use-oauth-callback";

describe("useOAuthCallback", () => {
    it("calls exchange exactly once and exposes the resolved value", async () => {
        const exchange = vi.fn().mockResolvedValue({ token: "abc" });
        const onSuccess = vi.fn();
        const { result } = renderHook(() => useOAuthCallback({ exchange, onSuccess }));
        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.status).toBe("success"));
        expect(result.current.data).toEqual({ token: "abc" });
        expect(onSuccess).toHaveBeenCalledWith({ token: "abc" });
        expect(exchange).toHaveBeenCalledTimes(1);
    });

    it("captures errors and invokes onError", async () => {
        const exchange = vi.fn().mockRejectedValue(new Error("boom"));
        const onError = vi.fn();
        const { result } = renderHook(() => useOAuthCallback({ exchange, onError }));
        await waitFor(() => expect(result.current.status).toBe("error"));
        expect(result.current.error).toBeInstanceOf(Error);
        expect(onError).toHaveBeenCalled();
    });
});

describe("useOAuthCallback — cancellation and callbacks", () => {
    it("skips the callbacks when unmounted before the exchange settles", async () => {
        let release: (value: string) => void = () => undefined;
        const onSuccess = vi.fn();
        const { unmount, result } = renderHook(() =>
            useOAuthCallback<string>({
                exchange: () => new Promise<string>((resolve) => (release = resolve)),
                onSuccess,
            }),
        );
        expect(result.current.status).toBe("pending");

        unmount();
        release("token");
        await Promise.resolve();
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it("skips onError when unmounted before the rejection lands", async () => {
        let fail: (reason: unknown) => void = () => undefined;
        const onError = vi.fn();
        const { unmount } = renderHook(() =>
            useOAuthCallback<string>({
                exchange: () => new Promise<string>((_resolve, reject) => (fail = reject)),
                onError,
            }),
        );

        unmount();
        fail(new Error("late"));
        await Promise.resolve();
        expect(onError).not.toHaveBeenCalled();
    });

    it("works without onSuccess or onError handlers", async () => {
        const { result } = renderHook(() =>
            useOAuthCallback<string>({ exchange: async () => "ok" }),
        );
        await waitFor(() => expect(result.current.status).toBe("success"));
        expect(result.current.data).toBe("ok");
        expect(result.current.loading).toBe(false);
    });
});

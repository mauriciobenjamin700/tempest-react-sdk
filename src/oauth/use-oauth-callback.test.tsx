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

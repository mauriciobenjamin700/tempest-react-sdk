import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAsync } from "./use-async";

describe("useAsync", () => {
    it("starts in idle", () => {
        const { result } = renderHook(() => useAsync(async () => 1));
        expect(result.current.status).toBe("idle");
        expect(result.current.isPending).toBe(false);
    });

    it("resolves to success with data", async () => {
        const { result } = renderHook(() => useAsync(async () => 42));
        await act(async () => {
            await result.current.run();
        });
        expect(result.current.status).toBe("success");
        expect(result.current.data).toBe(42);
    });

    it("captures error", async () => {
        const err = new Error("boom");
        const { result } = renderHook(() =>
            useAsync(async () => {
                throw err;
            }),
        );
        await act(async () => {
            await result.current.run().catch(() => undefined);
        });
        expect(result.current.status).toBe("error");
        expect(result.current.error).toBe(err);
    });

    it("immediate triggers on mount", async () => {
        const { result } = renderHook(() => useAsync(async () => "x", [], { immediate: true }));
        await waitFor(() => expect(result.current.status).toBe("success"));
        expect(result.current.data).toBe("x");
    });

    it("reset returns to idle", async () => {
        const { result } = renderHook(() => useAsync(async () => 1));
        await act(async () => {
            await result.current.run();
        });
        act(() => result.current.reset());
        expect(result.current.status).toBe("idle");
        expect(result.current.data).toBeUndefined();
    });
});

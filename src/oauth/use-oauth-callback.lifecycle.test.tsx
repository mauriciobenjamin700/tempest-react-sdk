import { act, render, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, useState } from "react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { useOAuthCallback } from "./use-oauth-callback";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
}

describe("useOAuthCallback — one exchange per logical mount, and its result is kept", () => {
    it("delivers the result under StrictMode, whose simulated unmount used to discard it", async () => {
        const exchange = vi.fn(async () => "session");
        const onSuccess = vi.fn();

        const { result } = renderHook(() => useOAuthCallback<string>({ exchange, onSuccess }), {
            wrapper: StrictMode,
        });

        await waitFor(() => expect(result.current.status).toBe("success"));
        expect(result.current.data).toBe("session");
        expect(exchange).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalledWith("session");
    });

    it("delivers the error under StrictMode", async () => {
        const onError = vi.fn();

        const { result } = renderHook(
            () =>
                useOAuthCallback<string>({
                    exchange: () => Promise.reject(new Error("401")),
                    onError,
                }),
            { wrapper: StrictMode },
        );

        await waitFor(() => expect(result.current.status).toBe("error"));
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it("survives a parent re-render with inline callbacks while the request is in flight", async () => {
        const pending = deferred<string>();
        const exchange = vi.fn(() => pending.promise);
        const firstOnSuccess = vi.fn();
        const latestOnSuccess = vi.fn();
        let bump: () => void = () => undefined;
        let status = "";

        function Page(): ReactElement {
            const [tick, setTick] = useState<number>(0);
            bump = () => setTick((n) => n + 1);
            const state = useOAuthCallback<string>({
                exchange: () => exchange(),
                onSuccess: (value) => (tick === 0 ? firstOnSuccess(value) : latestOnSuccess(value)),
            });
            status = state.status;
            return <p>{state.status}</p>;
        }

        render(<Page />);
        act(() => bump());
        await act(async () => pending.resolve("session"));

        await waitFor(() => expect(status).toBe("success"));
        expect(exchange).toHaveBeenCalledTimes(1);
        expect(firstOnSuccess).not.toHaveBeenCalled();
        expect(latestOnSuccess).toHaveBeenCalledWith("session");
    });

    it("still drops the result after a real unmount under StrictMode", async () => {
        const pending = deferred<string>();
        const onSuccess = vi.fn();

        const { unmount } = renderHook(
            () => useOAuthCallback<string>({ exchange: () => pending.promise, onSuccess }),
            { wrapper: StrictMode },
        );
        unmount();
        await act(async () => pending.resolve("late"));

        expect(onSuccess).not.toHaveBeenCalled();
    });
});

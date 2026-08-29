import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLinkStats } from "./use-link-stats";

interface FakeConnection {
    connection: RTCPeerConnection;
    getStats: ReturnType<typeof vi.fn>;
    setState: (state: RTCPeerConnectionState) => void;
}

/**
 * An `RTCPeerConnection` double.
 *
 * jsdom ships no WebRTC at all, so the hook is exercised against the two
 * members it actually touches: the connection state it gates on, and the report
 * it reduces.
 */
function fakeConnection(
    bytes: () => number,
    state: RTCPeerConnectionState = "connected",
): FakeConnection {
    let current = state;
    const getStats = vi.fn(async () => {
        const map = new Map<string, unknown>();
        map.set("out", {
            type: "outbound-rtp",
            kind: "video",
            bytesSent: bytes(),
            frameWidth: 1280,
            frameHeight: 720,
            framesPerSecond: 30,
        });
        return map as unknown as RTCStatsReport;
    });
    const connection = {
        getStats,
        get connectionState(): RTCPeerConnectionState {
            return current;
        },
    } as unknown as RTCPeerConnection;
    return {
        connection,
        getStats,
        setState: (next: RTCPeerConnectionState): void => {
            current = next;
        },
    };
}

function setVisibility(value: "visible" | "hidden"): void {
    Object.defineProperty(document, "visibilityState", { configurable: true, value });
    document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
    setVisibility("visible");
});

describe("useLinkStats", () => {
    it("returns null until the first sample lands", () => {
        const { connection } = fakeConnection(() => 0);
        const { result } = renderHook(() => useLinkStats(connection));

        expect(result.current).toBeNull();
    });

    it("samples on the interval and reports the delta", async () => {
        let sent = 0;
        const { connection } = fakeConnection(() => sent);

        vi.useFakeTimers();
        try {
            const { result } = renderHook(() => useLinkStats(connection, { intervalMs: 1000 }));
            await act(async () => {
                vi.advanceTimersByTime(1000);
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(result.current?.kbps).toBe(0);

            sent = 125_000;
            await act(async () => {
                vi.advanceTimersByTime(1000);
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(result.current?.kbps).toBe(1000);
            expect(result.current).toMatchObject({ width: 1280, height: 720, fps: 30 });
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not sample a connection that is not connected", async () => {
        const { connection, getStats } = fakeConnection(() => 0, "connecting");

        vi.useFakeTimers();
        try {
            renderHook(() => useLinkStats(connection, { intervalMs: 500 }));
            await act(async () => {
                vi.advanceTimersByTime(2000);
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(getStats).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("stops sampling while the tab is hidden", async () => {
        const { connection, getStats } = fakeConnection(() => 0);

        vi.useFakeTimers();
        try {
            renderHook(() => useLinkStats(connection, { intervalMs: 500 }));
            act(() => setVisibility("hidden"));
            await act(async () => {
                vi.advanceTimersByTime(3000);
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(getStats).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("keeps sampling in the background when told to", async () => {
        const { connection, getStats } = fakeConnection(() => 0);
        renderHook(() => useLinkStats(connection, { intervalMs: 500, pauseWhenHidden: false }));

        act(() => setVisibility("hidden"));

        await waitFor(() => expect(getStats).toHaveBeenCalled());
    });

    it("does not derive a rate across the gap the tab spent hidden", async () => {
        let sent = 0;
        const { connection } = fakeConnection(() => sent);

        vi.useFakeTimers();
        try {
            const { result } = renderHook(() => useLinkStats(connection, { intervalMs: 1000 }));
            await act(async () => {
                vi.advanceTimersByTime(1000);
                await vi.advanceTimersByTimeAsync(0);
            });

            act(() => setVisibility("hidden"));
            vi.advanceTimersByTime(300_000);
            sent = 40_000_000;
            act(() => setVisibility("visible"));

            await act(async () => {
                vi.advanceTimersByTime(1000);
                await vi.advanceTimersByTimeAsync(0);
            });

            expect(result.current?.kbps).toBe(0);
            expect(result.current?.width).toBe(1280);
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not stack samples when one takes longer than the interval", async () => {
        let release: (() => void) | null = null;
        const getStats = vi.fn(
            () =>
                new Promise<RTCStatsReport>((resolve) => {
                    release = () => resolve(new Map() as unknown as RTCStatsReport);
                }),
        );
        const connection = {
            getStats,
            connectionState: "connected" as RTCPeerConnectionState,
        } as unknown as RTCPeerConnection;

        vi.useFakeTimers();
        try {
            renderHook(() => useLinkStats(connection, { intervalMs: 200 }));
            await act(async () => {
                vi.advanceTimersByTime(1000);
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(getStats).toHaveBeenCalledTimes(1);

            await act(async () => {
                release?.();
                await vi.advanceTimersByTimeAsync(0);
                vi.advanceTimersByTime(200);
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(getStats).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("samples nothing while there is no connection", async () => {
        const { connection, getStats } = fakeConnection(() => 0);

        vi.useFakeTimers();
        let rerender: (props: { pc: RTCPeerConnection | null }) => void;
        try {
            const rendered = renderHook(
                ({ pc }: { pc: RTCPeerConnection | null }) => useLinkStats(pc, { intervalMs: 200 }),
                { initialProps: { pc: null as RTCPeerConnection | null } },
            );
            rerender = rendered.rerender;
            await act(async () => {
                vi.advanceTimersByTime(1000);
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(rendered.result.current).toBeNull();
            expect(getStats).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }

        rerender({ pc: connection });
        await waitFor(() => expect(getStats).toHaveBeenCalled());
    });

    it("starts over when the connection is replaced", async () => {
        const first = fakeConnection(() => 500_000);
        const { rerender, result } = renderHook(
            ({ pc }: { pc: RTCPeerConnection }) => useLinkStats(pc, { intervalMs: 200 }),
            { initialProps: { pc: first.connection } },
        );

        await waitFor(() => expect(result.current).not.toBeNull());

        const second = fakeConnection(() => 0);
        rerender({ pc: second.connection });

        expect(result.current).toBeNull();
        await waitFor(() => expect(second.getStats).toHaveBeenCalled());
    });

    it("passes the kind through to the sampler", async () => {
        const getStats = vi.fn(async () => {
            const map = new Map<string, unknown>();
            map.set("mic", { type: "outbound-rtp", kind: "audio", bytesSent: 6_000 });
            return map as unknown as RTCStatsReport;
        });
        const connection = {
            getStats,
            connectionState: "connected" as RTCPeerConnectionState,
        } as unknown as RTCPeerConnection;

        const { result } = renderHook(() =>
            useLinkStats(connection, { intervalMs: 100, kind: "audio" }),
        );

        await waitFor(() => expect(result.current).not.toBeNull());
        expect(result.current?.kbps).toBe(0);
    });

    it("survives a getStats that rejects", async () => {
        const getStats = vi.fn(async () => {
            throw new Error("connection is gone");
        });
        const connection = {
            getStats,
            connectionState: "connected" as RTCPeerConnectionState,
        } as unknown as RTCPeerConnection;

        const { result } = renderHook(() => useLinkStats(connection, { intervalMs: 200 }));

        await waitFor(() => expect(getStats).toHaveBeenCalled());
        expect(result.current).toBeNull();
    });
});

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePositionTracker } from "./use-position-tracker";

function installGeolocation(): {
    emit: (latitude: number, longitude: number) => void;
    fail: (error: GeolocationPositionError) => void;
    clearWatch: ReturnType<typeof vi.fn>;
} {
    let success: PositionCallback | null = null;
    let failure: PositionErrorCallback | null = null;
    const clearWatch = vi.fn();
    Object.assign(navigator, {
        geolocation: {
            watchPosition: (
                onSuccess: PositionCallback,
                onError?: PositionErrorCallback | null,
            ) => {
                success = onSuccess;
                failure = onError ?? null;
                return 7;
            },
            clearWatch,
            getCurrentPosition: vi.fn(),
        },
    });
    return {
        emit: (latitude, longitude) =>
            success?.({
                coords: {
                    latitude,
                    longitude,
                    accuracy: 5,
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null,
                },
                timestamp: 0,
            } as unknown as GeolocationPosition),
        fail: (error) => failure?.(error),
        clearWatch,
    };
}

describe("usePositionTracker", () => {
    afterEach(() => {
        delete (navigator as { geolocation?: unknown }).geolocation;
    });

    it("is idle before start", () => {
        const { result } = renderHook(() => usePositionTracker());
        expect(result.current.status).toBe("idle");
        expect(result.current.isTracking).toBe(false);
        expect(result.current.points).toHaveLength(0);
    });

    it("records points and exposes lastPoint + distance after start", () => {
        const geo = installGeolocation();
        const { result } = renderHook(() => usePositionTracker({ minDistanceKm: 0 }));

        act(() => result.current.start());
        expect(result.current.isTracking).toBe(true);

        act(() => geo.emit(0, 0));
        act(() => geo.emit(0, 1));

        expect(result.current.points).toHaveLength(2);
        expect(result.current.lastPoint?.longitude).toBe(1);
        expect(result.current.distanceKm).toBeGreaterThan(100);
    });

    it("clears the watch on unmount", () => {
        const geo = installGeolocation();
        const { result, unmount } = renderHook(() => usePositionTracker());
        act(() => result.current.start());
        unmount();
        expect(geo.clearWatch).toHaveBeenCalledWith(7);
    });

    it("clear() resets points and distance", () => {
        const geo = installGeolocation();
        const { result } = renderHook(() => usePositionTracker({ minDistanceKm: 0 }));
        act(() => result.current.start());
        act(() => geo.emit(0, 0));
        act(() => result.current.clear());
        expect(result.current.points).toHaveLength(0);
        expect(result.current.distanceKm).toBe(0);
    });

    it("starts on its own when asked, and stops on demand", () => {
        installGeolocation();
        const { result } = renderHook(() => usePositionTracker({ autoStart: true }));

        expect(result.current.isTracking).toBe(true);

        act(() => result.current.stop());
        expect(result.current.isTracking).toBe(false);
    });

    it("hands a refusal to the caller instead of swallowing it", () => {
        const geo = installGeolocation();
        const onError = vi.fn();
        const { result } = renderHook(() => usePositionTracker({ onError }));
        act(() => result.current.start());

        const denied = { code: 1, message: "User denied Geolocation" } as GeolocationPositionError;
        act(() => geo.fail(denied));

        expect(onError).toHaveBeenCalledWith(denied);
    });

    it("recovers from a transient error and exposes the last error meanwhile", () => {
        const geo = installGeolocation();
        const { result } = renderHook(() => usePositionTracker({ minDistanceKm: 0 }));
        act(() => result.current.start());

        const unavailable = {
            code: 2,
            message: "Position unavailable",
        } as GeolocationPositionError;
        act(() => geo.fail(unavailable));
        expect(result.current.status).toBe("error");
        expect(result.current.lastError).toBe(unavailable);

        act(() => geo.emit(0, 0));
        expect(result.current.status).toBe("tracking");
        expect(result.current.isTracking).toBe(true);
        expect(result.current.lastError).toBeNull();
    });

    it("keeps a refusal in error and tells it apart through lastError", () => {
        const geo = installGeolocation();
        const { result } = renderHook(() => usePositionTracker({ minDistanceKm: 0 }));
        act(() => result.current.start());

        const timeout = { code: 3, message: "Timeout" } as GeolocationPositionError;
        const denied = { code: 1, message: "User denied Geolocation" } as GeolocationPositionError;
        act(() => geo.fail(timeout));
        act(() => geo.fail(denied));

        expect(result.current.status).toBe("error");
        expect(result.current.lastError?.code).toBe(1);
        expect(geo.clearWatch).toHaveBeenCalledWith(7);
    });
});

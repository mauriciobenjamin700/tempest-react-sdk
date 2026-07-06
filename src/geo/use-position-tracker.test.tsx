import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePositionTracker } from "./use-position-tracker";

function installGeolocation(): {
    emit: (latitude: number, longitude: number) => void;
    clearWatch: ReturnType<typeof vi.fn>;
} {
    let success: PositionCallback | null = null;
    const clearWatch = vi.fn();
    Object.assign(navigator, {
        geolocation: {
            watchPosition: (onSuccess: PositionCallback) => {
                success = onSuccess;
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
});

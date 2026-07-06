import { afterEach, describe, expect, it, vi } from "vitest";
import { createPositionTracker } from "./create-position-tracker";

type SuccessFn = PositionCallback;
type ErrorFn = PositionErrorCallback;

/** Install a controllable geolocation mock; returns handles to drive it. */
function installGeolocation(): {
    emit: (latitude: number, longitude: number, timestamp?: number) => void;
    fail: (code: number) => void;
    clearWatch: ReturnType<typeof vi.fn>;
} {
    let success: SuccessFn | null = null;
    let error: ErrorFn | null = null;
    const clearWatch = vi.fn();

    Object.assign(navigator, {
        geolocation: {
            watchPosition: (onSuccess: SuccessFn, onError?: ErrorFn) => {
                success = onSuccess;
                error = onError ?? null;
                return 1;
            },
            clearWatch,
            getCurrentPosition: vi.fn(),
        },
    });

    return {
        emit: (latitude, longitude, timestamp = 0) =>
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
                timestamp,
            } as unknown as GeolocationPosition),
        fail: (code) => error?.({ code, message: "err" } as GeolocationPositionError),
        clearWatch,
    };
}

describe("createPositionTracker", () => {
    afterEach(() => {
        delete (navigator as { geolocation?: unknown }).geolocation;
    });

    it("accumulates points and distance across the run", () => {
        const geo = installGeolocation();
        const tracker = createPositionTracker({ minDistanceKm: 0 });
        tracker.start();
        expect(tracker.status).toBe("tracking");

        geo.emit(0, 0);
        geo.emit(0, 1); // ~111 km east at the equator
        expect(tracker.points).toHaveLength(2);
        expect(tracker.distanceKm).toBeGreaterThan(100);
    });

    it("filters jitter below minDistanceKm", () => {
        const geo = installGeolocation();
        const tracker = createPositionTracker({ minDistanceKm: 1 });
        tracker.start();

        geo.emit(0, 0);
        geo.emit(0, 0.000001); // a few centimeters — dropped
        expect(tracker.points).toHaveLength(1);
        expect(tracker.distanceKm).toBe(0);
    });

    it("caps retained points at maxPoints but keeps counting distance", () => {
        const geo = installGeolocation();
        const tracker = createPositionTracker({ minDistanceKm: 0, maxPoints: 2 });
        tracker.start();

        geo.emit(0, 0);
        geo.emit(0, 1);
        geo.emit(0, 2);
        expect(tracker.points).toHaveLength(2);
        expect(tracker.distanceKm).toBeGreaterThan(200);
    });

    it("stop() clears the watch; clear() resets the trajectory", () => {
        const geo = installGeolocation();
        const tracker = createPositionTracker({ minDistanceKm: 0 });
        tracker.start();
        geo.emit(0, 0);
        tracker.stop();
        expect(geo.clearWatch).toHaveBeenCalledWith(1);
        expect(tracker.status).toBe("idle");

        tracker.clear();
        expect(tracker.points).toHaveLength(0);
        expect(tracker.distanceKm).toBe(0);
    });

    it("reports error status on geolocation failure", () => {
        const geo = installGeolocation();
        const onError = vi.fn();
        const tracker = createPositionTracker({ onError });
        tracker.start();
        geo.fail(1);
        expect(tracker.status).toBe("error");
        expect(onError).toHaveBeenCalled();
    });

    it("errors when geolocation is unavailable", () => {
        const tracker = createPositionTracker();
        tracker.start();
        expect(tracker.status).toBe("error");
    });
});

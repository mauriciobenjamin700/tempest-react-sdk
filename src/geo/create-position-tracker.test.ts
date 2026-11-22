import { afterEach, describe, expect, it, vi } from "vitest";
import { createPositionTracker } from "./create-position-tracker";

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

type SuccessFn = PositionCallback;
type ErrorFn = PositionErrorCallback;

/** Install a controllable geolocation mock; returns handles to drive it. */
function installGeolocation(): {
    emit: (
        latitude: number,
        longitude: number,
        timestamp?: number,
        motion?: { speed?: number | null; heading?: number | null },
    ) => void;
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
        emit: (latitude, longitude, timestamp = 0, motion = {}) =>
            success?.({
                coords: {
                    latitude,
                    longitude,
                    accuracy: 5,
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: motion.heading ?? null,
                    speed: motion.speed ?? null,
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

    it("hands onPoint every kept reading once, in order, and none of the jitter", () => {
        const geo = installGeolocation();
        const onPoint = vi.fn();
        const tracker = createPositionTracker({ minDistanceKm: 0.005, maxPoints: 1, onPoint });
        tracker.start();

        geo.emit(0, 0, 1);
        geo.emit(0, 0.000001, 2);
        geo.emit(0, 1, 3);
        geo.emit(0, 2, 4);

        expect(
            onPoint.mock.calls.map(([point]) => (point as { timestamp: number }).timestamp),
        ).toEqual([1, 3, 4]);
        expect(tracker.points).toHaveLength(1);
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

    describe("recovery after a transient error", () => {
        it.each([
            ["POSITION_UNAVAILABLE", POSITION_UNAVAILABLE],
            ["TIMEOUT", TIMEOUT],
        ])("returns to tracking when a reading arrives after %s", (_name, code) => {
            const geo = installGeolocation();
            const statuses: string[] = [];
            const tracker = createPositionTracker({
                minDistanceKm: 0,
                onStatusChange: (s) => statuses.push(s),
            });
            tracker.start();
            geo.fail(code);
            expect(tracker.status).toBe("error");
            expect(tracker.lastError?.code).toBe(code);

            geo.emit(0, 0);
            expect(tracker.status).toBe("tracking");
            expect(tracker.lastError).toBeNull();
            expect(statuses).toEqual(["tracking", "error", "tracking"]);
        });

        it("stays in error through repeated timeouts and reports each one", () => {
            const geo = installGeolocation();
            const onError = vi.fn();
            const statuses: string[] = [];
            const tracker = createPositionTracker({
                onError,
                onStatusChange: (s) => statuses.push(s),
            });
            tracker.start();
            geo.fail(TIMEOUT);
            geo.fail(TIMEOUT);
            geo.fail(POSITION_UNAVAILABLE);
            expect(tracker.status).toBe("error");
            expect(tracker.lastError?.code).toBe(POSITION_UNAVAILABLE);
            expect(onError).toHaveBeenCalledTimes(3);
            expect(statuses).toEqual(["tracking", "error"]);
        });

        it("recovers on a reading the jitter filter discards", () => {
            const geo = installGeolocation();
            const tracker = createPositionTracker({ minDistanceKm: 1 });
            tracker.start();
            geo.emit(0, 0);
            geo.fail(POSITION_UNAVAILABLE);
            geo.emit(0, 0.000001);
            expect(tracker.points).toHaveLength(1);
            expect(tracker.status).toBe("tracking");
            expect(tracker.lastError).toBeNull();
        });

        it("keeps PERMISSION_DENIED terminal and releases the dead watch", () => {
            const geo = installGeolocation();
            const tracker = createPositionTracker({ minDistanceKm: 0 });
            tracker.start();
            geo.fail(PERMISSION_DENIED);
            expect(tracker.status).toBe("error");
            expect(tracker.lastError?.code).toBe(PERMISSION_DENIED);
            expect(geo.clearWatch).toHaveBeenCalledWith(1);

            geo.emit(0, 0);
            expect(tracker.status).toBe("error");
            expect(tracker.points).toHaveLength(0);
        });

        it("lets start() retry after a refusal", () => {
            const geo = installGeolocation();
            const tracker = createPositionTracker({ minDistanceKm: 0 });
            tracker.start();
            geo.fail(PERMISSION_DENIED);

            tracker.start();
            expect(tracker.status).toBe("tracking");
            expect(tracker.lastError).toBeNull();
            geo.emit(0, 0);
            expect(tracker.points).toHaveLength(1);
        });

        it("ignores a reading or error that lands after stop()", () => {
            const geo = installGeolocation();
            const tracker = createPositionTracker({ minDistanceKm: 0 });
            tracker.start();
            tracker.stop();
            geo.emit(0, 0);
            geo.fail(TIMEOUT);
            expect(tracker.status).toBe("idle");
            expect(tracker.lastError).toBeNull();
        });

        it("releases a watch the browser refuses before watchPosition returns", () => {
            const clearWatch = vi.fn();
            Object.assign(navigator, {
                geolocation: {
                    watchPosition: (_onSuccess: SuccessFn, onError?: ErrorFn) => {
                        onError?.({
                            code: PERMISSION_DENIED,
                            message: "denied",
                        } as GeolocationPositionError);
                        return 4;
                    },
                    clearWatch,
                    getCurrentPosition: vi.fn(),
                },
            });
            const tracker = createPositionTracker();
            tracker.start();
            expect(tracker.status).toBe("error");
            expect(clearWatch).toHaveBeenCalledWith(4);
        });

        it("stop() forgets the last error", () => {
            const geo = installGeolocation();
            const tracker = createPositionTracker();
            tracker.start();
            geo.fail(TIMEOUT);
            tracker.stop();
            expect(tracker.lastError).toBeNull();
        });

        it("clear() forgets the last error", () => {
            const geo = installGeolocation();
            const tracker = createPositionTracker();
            tracker.start();
            geo.fail(TIMEOUT);
            tracker.clear();
            expect(tracker.lastError).toBeNull();
            expect(tracker.status).toBe("idle");
        });
    });

    describe("speed and heading", () => {
        it("copies speed and heading from the reading", () => {
            const geo = installGeolocation();
            const tracker = createPositionTracker({ minDistanceKm: 0 });
            tracker.start();
            geo.emit(0, 0, 0, { speed: 12.5, heading: 90 });
            expect(tracker.points[0]).toMatchObject({ speed: 12.5, heading: 90 });
        });

        it("records null when the browser reports null", () => {
            const geo = installGeolocation();
            const tracker = createPositionTracker({ minDistanceKm: 0 });
            tracker.start();
            geo.emit(0, 0);
            expect(tracker.points[0].speed).toBeNull();
            expect(tracker.points[0].heading).toBeNull();
        });

        it("records null for the NaN heading a stationary device reports", () => {
            const geo = installGeolocation();
            const tracker = createPositionTracker({ minDistanceKm: 0 });
            tracker.start();
            geo.emit(0, 0, 0, { speed: 0, heading: Number.NaN });
            expect(tracker.points[0].speed).toBe(0);
            expect(tracker.points[0].heading).toBeNull();
        });
    });
});

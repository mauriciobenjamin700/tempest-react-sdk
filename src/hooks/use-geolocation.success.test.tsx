import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGeolocation } from "./use-geolocation";

describe("useGeolocation success", () => {
    afterEach(() => {
        delete (navigator as { geolocation?: unknown }).geolocation;
    });

    it("populates coords on success", async () => {
        Object.assign(navigator, {
            geolocation: {
                getCurrentPosition: (success: PositionCallback) =>
                    success({
                        coords: {
                            latitude: 1,
                            longitude: 2,
                            accuracy: 10,
                            altitude: null,
                            altitudeAccuracy: null,
                            heading: null,
                            speed: null,
                        },
                        timestamp: 1234,
                    } as unknown as GeolocationPosition),
                watchPosition: vi.fn(),
                clearWatch: vi.fn(),
            },
        });
        const { result } = renderHook(() => useGeolocation());
        await waitFor(() => expect(result.current.coords?.latitude).toBe(1));
        expect(result.current.loading).toBe(false);
    });

    it("populates error on failure", async () => {
        Object.assign(navigator, {
            geolocation: {
                getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) =>
                    error?.({ code: 1, message: "denied" } as GeolocationPositionError),
                watchPosition: vi.fn(),
                clearWatch: vi.fn(),
            },
        });
        const { result } = renderHook(() => useGeolocation());
        await waitFor(() => expect(result.current.error?.code).toBe(1));
    });
});

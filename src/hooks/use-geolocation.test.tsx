import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGeolocation } from "./use-geolocation";

describe("useGeolocation", () => {
    it("does not crash when disabled", () => {
        const { result } = renderHook(() => useGeolocation({ disabled: true }));
        expect(result.current.loading).toBe(false);
        expect(result.current.coords).toBeNull();
    });
});

describe("useGeolocation — a real geolocation backend", () => {
    /** jsdom exposes no `navigator.geolocation`; this is the API the hook expects. */
    function stubGeolocation() {
        const geolocation = {
            getCurrentPosition:
                vi.fn<(success: PositionCallback, error?: PositionErrorCallback | null) => void>(),
            watchPosition: vi.fn<
                (success: PositionCallback, error?: PositionErrorCallback | null) => number
            >(() => 7),
            clearWatch: vi.fn(),
        };
        vi.stubGlobal("navigator", { ...navigator, geolocation });
        return geolocation;
    }

    const position = {
        coords: { latitude: -23.55, longitude: -46.63 } as GeolocationCoordinates,
        timestamp: 1_700_000_000_000,
    } as GeolocationPosition;

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reads the position once by default", () => {
        const geolocation = stubGeolocation();
        const { result } = renderHook(() => useGeolocation());

        act(() => geolocation.getCurrentPosition.mock.calls[0][0](position));

        expect(result.current.coords?.latitude).toBe(-23.55);
        expect(result.current.loading).toBe(false);
        expect(geolocation.watchPosition).not.toHaveBeenCalled();
    });

    it("watches the position and clears the watch on unmount", () => {
        const geolocation = stubGeolocation();
        const { result, unmount } = renderHook(() => useGeolocation({ watch: true }));

        act(() => geolocation.watchPosition.mock.calls[0][0](position));
        expect(result.current.coords?.longitude).toBe(-46.63);

        unmount();
        expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
    });

    it("reports a refusal without pretending it is still loading", () => {
        const geolocation = stubGeolocation();
        const { result } = renderHook(() => useGeolocation());
        const denied = { code: 1, message: "User denied Geolocation" } as GeolocationPositionError;

        act(() => geolocation.getCurrentPosition.mock.calls[0][1]?.(denied));

        expect(result.current.error).toBe(denied);
        expect(result.current.loading).toBe(false);
    });
});
